use super::*;

fn state() -> AppState {
    AppState {
        current_process: Arc::new(Mutex::new(None)),
        ffmpeg_busy: Arc::new(AtomicBool::new(false)),
        cancel_requested: Arc::new(AtomicBool::new(false)),
        image_busy: Arc::new(AtomicBool::new(false)),
    }
}

#[test]
fn second_ffmpeg_job_is_refused_while_first_runs() {
    let s = state();
    let _first = start_ffmpeg_job(&s).unwrap();
    assert_eq!(start_ffmpeg_job(&s).err().as_deref(), Some(BUSY_ERROR));
}

#[test]
fn ffmpeg_slot_is_released_when_job_ends() {
    let s = state();
    drop(start_ffmpeg_job(&s).unwrap());
    assert!(!s.ffmpeg_busy.load(Ordering::Acquire));
    assert!(start_ffmpeg_job(&s).is_ok());
}

#[test]
fn ffmpeg_slot_is_released_on_early_error_return() {
    let s = state();
    let failing_job = || -> Result<(), String> {
        let _job = start_ffmpeg_job(&s)?;
        Err("FFmpeg exited with code Some(1)".into())
    };
    assert!(failing_job().is_err());
    assert!(start_ffmpeg_job(&s).is_ok());
}

#[test]
fn new_ffmpeg_job_clears_previous_cancellation() {
    let s = state();
    s.cancel_requested.store(true, Ordering::Release);
    let _job = start_ffmpeg_job(&s).unwrap();
    assert!(!s.cancel_requested.load(Ordering::Acquire));
}

#[test]
fn refused_job_does_not_clear_running_jobs_cancellation() {
    let s = state();
    let _running = start_ffmpeg_job(&s).unwrap();
    s.cancel_requested.store(true, Ordering::Release);
    assert!(start_ffmpeg_job(&s).is_err());
    assert!(s.cancel_requested.load(Ordering::Acquire));
}

#[test]
fn image_and_ffmpeg_jobs_are_independent() {
    let s = state();
    let _ffmpeg = start_ffmpeg_job(&s).unwrap();
    let image = JobGuard::try_acquire(&s.image_busy).unwrap();
    assert_eq!(
        JobGuard::try_acquire(&s.image_busy).err().as_deref(),
        Some(BUSY_ERROR)
    );
    drop(image);
    assert!(JobGuard::try_acquire(&s.image_busy).is_ok());
}

#[test]
fn concurrent_launches_admit_exactly_one_job() {
    let s = state();
    let barrier = std::sync::Barrier::new(8);
    let admitted = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|_| {
                scope.spawn(|| {
                    barrier.wait();
                    // Keep the guard alive until every thread has tried.
                    let job = JobGuard::try_acquire(&s.ffmpeg_busy);
                    let ok = job.is_ok();
                    barrier.wait();
                    ok
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).filter(|ok| *ok).count()
    });
    assert_eq!(admitted, 1);
}

#[test]
fn cancellation_between_files_is_kept_until_the_job_ends() {
    let s = state();
    let job = start_ffmpeg_job(&s).unwrap();
    assert!(s.current_process.lock().unwrap().is_none());
    request_cancellation(&s).unwrap();
    assert!(s.cancel_requested.load(Ordering::Acquire));
    assert!(start_ffmpeg_job(&s).is_err());
    assert!(s.cancel_requested.load(Ordering::Acquire));
    drop(job);
    let _next = start_ffmpeg_job(&s).unwrap();
    assert!(!s.cancel_requested.load(Ordering::Acquire));
}

#[test]
fn idle_cancellation_does_not_affect_the_next_job() {
    let s = state();
    request_cancellation(&s).unwrap();
    assert!(!s.cancel_requested.load(Ordering::Acquire));
    assert!(start_ffmpeg_job(&s).is_ok());
}

#[test]
fn job_initialization_waits_for_the_process_mutex() {
    let s = state();
    let process = s.current_process.lock().unwrap();
    std::thread::scope(|scope| {
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let state_ref = &s;
        scope.spawn(move || {
            ready_tx.send(()).unwrap();
            let result = start_ffmpeg_job(state_ref);
            done_tx.send(result.is_ok()).unwrap();
        });
        ready_rx.recv().unwrap();
        let early = done_rx.recv_timeout(std::time::Duration::from_millis(100));
        let busy_before_unlock = s.ffmpeg_busy.load(Ordering::Acquire);
        drop(process);
        assert!(matches!(early, Err(std::sync::mpsc::RecvTimeoutError::Timeout)));
        assert!(!busy_before_unlock);
        assert!(done_rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap());
    });
}

#[test]
fn cancellation_waits_for_the_process_mutex_before_changing_the_flag() {
    let s = state();
    let _job = start_ffmpeg_job(&s).unwrap();
    let process = s.current_process.lock().unwrap();
    std::thread::scope(|scope| {
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let state_ref = &s;
        scope.spawn(move || {
            ready_tx.send(()).unwrap();
            done_tx.send(request_cancellation(state_ref).is_ok()).unwrap();
        });
        ready_rx.recv().unwrap();
        let early = done_rx.recv_timeout(std::time::Duration::from_millis(100));
        let cancelled_before_unlock = s.cancel_requested.load(Ordering::Acquire);
        drop(process);
        assert!(matches!(early, Err(std::sync::mpsc::RecvTimeoutError::Timeout)));
        assert!(!cancelled_before_unlock);
        assert!(done_rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap());
        assert!(s.cancel_requested.load(Ordering::Acquire));
    });
}
