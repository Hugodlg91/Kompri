use super::*;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "mediaforge-output-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn input(&self) -> PathBuf {
        let path = self.file("input.png");
        image::RgbImage::from_pixel(3, 2, image::Rgb([100, 150, 200]))
            .save(&path)
            .unwrap();
        path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        // Only remove the uniquely created fixture directory.
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn convert(input: &Path, output: &Path, format: &str) -> Result<(), String> {
    process_single_image(input.to_str().unwrap(), output.to_str().unwrap(), format, Some(85), None)
}

#[test]
fn existing_outputs_are_preserved_for_every_image_format() {
    let dir = TestDir::new();
    let input = dir.input();
    for format in ["jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"] {
        let output = dir.file(&format!("existing.{format}"));
        let original = b"existing user data must remain unchanged";
        std::fs::write(&output, original).unwrap();
        let error = convert(&input, &output, format).unwrap_err();
        assert!(error.contains("existe déjà"), "{error}");
        assert_eq!(std::fs::read(&output).unwrap(), original);
    }
}

#[test]
fn fresh_outputs_remain_decodable_for_every_image_format() {
    let dir = TestDir::new();
    let input = dir.input();
    for format in ["jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"] {
        let output = dir.file(&format!("new.{format}"));
        convert(&input, &output, format).unwrap();
        let decoded = image::open(&output).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (3, 2));
    }
}

#[test]
fn source_cannot_be_overwritten_by_conversion() {
    let dir = TestDir::new();
    let input = dir.input();
    let original = std::fs::read(&input).unwrap();
    assert!(convert(&input, &input, "png").is_err());
    assert_eq!(std::fs::read(&input).unwrap(), original);
}

#[test]
fn invalid_format_does_not_create_an_output() {
    let dir = TestDir::new();
    let input = dir.input();
    let output = dir.file("unsupported.xyz");
    assert!(convert(&input, &output, "xyz").is_err());
    assert!(!output.exists());
}

#[test]
fn preflight_rejects_files_and_directories_but_allows_unused_paths() {
    let dir = TestDir::new();
    let input = dir.input();
    assert!(ensure_output_available(input.to_str().unwrap()).is_err());
    assert!(ensure_output_available(dir.0.to_str().unwrap()).is_err());
    assert!(ensure_output_available(dir.file("new.wav").to_str().unwrap()).is_ok());
}

#[test]
fn concurrent_conversions_do_not_share_an_output() {
    let dir = TestDir::new();
    let input = dir.input();
    let output = dir.file("shared.png");
    let results = std::thread::scope(|scope| {
        let first = scope.spawn(|| convert(&input, &output, "png"));
        let second = scope.spawn(|| convert(&input, &output, "png"));
        [first.join().unwrap(), second.join().unwrap()]
    });
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    let decoded = image::open(&output).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (3, 2));
}

#[test]
fn jpeg_flattens_rgba_over_white() {
    let dir = TestDir::new();
    for (alpha, expected) in [(0, [255u8, 255, 255]), (128, [255, 127, 127]), (255, [255, 0, 0])] {
        let input = dir.file(&format!("alpha-{alpha}.png"));
        let output = dir.file(&format!("alpha-{alpha}.jpg"));
        image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 0, alpha]))
            .save(&input)
            .unwrap();
        convert(&input, &output, "jpg").unwrap();
        let decoded = image::open(&output).unwrap().to_rgb8();
        assert_eq!(decoded.dimensions(), (8, 8));
        for (actual, expected) in decoded.get_pixel(4, 4).0.into_iter().zip(expected) {
            assert!(actual.abs_diff(expected) <= 5, "alpha {alpha}: got {actual}, expected {expected}");
        }
    }
}

#[test]
fn jpeg_supports_grayscale_alpha_and_16bit_sources() {
    let dir = TestDir::new();
    let grayscale = dir.file("grayscale.png");
    image::GrayAlphaImage::from_pixel(8, 8, image::LumaA([0, 128]))
        .save(&grayscale)
        .unwrap();
    let high_depth = dir.file("rgba16.png");
    image::ImageBuffer::from_pixel(8, 8, image::Rgba([0u16, 0, 0, 32768]))
        .save(&high_depth)
        .unwrap();
    for (index, input) in [grayscale, high_depth].iter().enumerate() {
        let output = dir.file(&format!("converted-{index}.jpeg"));
        convert(input, &output, "jpeg").unwrap();
        let decoded = image::open(&output).unwrap().to_rgb8();
        for channel in decoded.get_pixel(4, 4).0 {
            assert!(channel.abs_diff(127) <= 5, "got {channel}");
        }
    }
}

#[test]
fn webp_preserves_alpha_without_quality_setting() {
    let dir = TestDir::new();
    let input = dir.file("alpha.png");
    let output = dir.file("alpha.webp");
    let pixels = vec![10, 20, 30, 255, 10, 20, 30, 128, 0, 0, 0, 0];
    image::RgbaImage::from_raw(3, 1, pixels.clone()).unwrap().save(&input).unwrap();
    process_single_image(input.to_str().unwrap(), output.to_str().unwrap(), "webp", None, None).unwrap();
    let decoded = image::open(&output).unwrap().to_rgba8();
    assert_eq!(decoded.dimensions(), (3, 1));
    assert_eq!(decoded.into_raw(), pixels);
}
