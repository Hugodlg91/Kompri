; Kompri NSIS installer hooks (Tauri v2 `bundle.windows.nsis.installerHooks`).
;
; Tauri identifies an NSIS install by `productName`: uninstall key
; HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<productName> and default
; folder %LOCALAPPDATA%\<productName>. Kompri was called MediaForge up to v1.2.1, so
; without help the Kompri installer would land next to the old MediaForge install.
; NSIS_HOOK_PREINSTALL therefore silently uninstalls MediaForge first.
;
; User data is untouched: settings.json / history.json live in
; %APPDATA%\com.mediaforge.app (the bundle identifier, unchanged), and the old
; uninstaller only deletes that folder when its "delete app data" checkbox is ticked,
; which never happens in silent mode (/S). This hook never touches that folder.
;
; Note: this file is included before INSTALLMODE / Var declarations, so everything here
; must be a macro (expanded at the insertion point inside Section Install), not a Function.

!define MEDIAFORGE_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediaForge"

; Asks before closing a running MediaForge (GUI), closes it directly in silent/passive
; mode, aborts the install if the user cancels. Same plugin and localized messages as
; Tauri's CheckIfAppIsRunning, with our own labels (that macro derives its labels from
; __LINE__ and is already used in this section). Clobbers $R0-$R2 (saved by caller).
!macro KOMPRI_CLOSE_LEGACY_APP EXE ID
  nsis_tauri_utils::FindProcessCurrentUser "${EXE}"
  Pop $R0
  ${If} $R0 = 0
    nsis_tauri_utils::StrReplace "$(appRunningOkKill)" "{{product_name}}" "MediaForge"
    Pop $R1
    nsis_tauri_utils::StrReplace "$(failedToKillApp)" "{{product_name}}" "MediaForge"
    Pop $R2
    IfSilent kompri_kill_${ID} 0
    ${IfThen} $PassiveMode = 1 ${|} Goto kompri_kill_${ID} ${|}
    MessageBox MB_OKCANCEL "$R1" IDOK kompri_kill_${ID}
    nsis_tauri_utils::StrReplace "$(appRunning)" "{{product_name}}" "MediaForge"
    Pop $R1
    Abort "$R1"
    kompri_kill_${ID}:
    nsis_tauri_utils::KillProcessCurrentUser "${EXE}"
    Pop $R0
    Sleep 500
    ${If} $R0 <> 0
    ${AndIf} $R0 <> 2
      Abort "$R2"
    ${EndIf}
  ${EndIf}
!macroend

; Deletes a MediaForge shortcut only if it points into the old install folder ($R9).
; Clobbers $0-$3 (IsShortcutTarget) and $R0 (saved by caller).
!macro KOMPRI_DELETE_LEGACY_SHORTCUT LNK
  ${If} ${FileExists} "${LNK}"
    !insertmacro IsShortcutTarget "${LNK}" "$R9\MediaForge.exe"
    Pop $R0
    ${If} $R0 <> 1
      !insertmacro IsShortcutTarget "${LNK}" "$R9\tauri-app.exe"
      Pop $R0
    ${EndIf}
    ${If} $R0 = 1
      Delete "${LNK}"
    ${EndIf}
  ${EndIf}
!macroend

!macro KOMPRI_REMOVE_LEGACY_MEDIAFORGE
  Push $0
  Push $1
  Push $2
  Push $3
  Push $R0
  Push $R1
  Push $R2
  Push $R7
  Push $R8
  Push $R9

  ReadRegStr $R8 HKCU "${MEDIAFORGE_UNINSTKEY}" "UninstallString"
  ReadRegStr $R9 HKCU "${MEDIAFORGE_UNINSTKEY}" "InstallLocation"
  ${If} $R8 != ""
    ; InstallLocation is stored quoted ("C:\...\MediaForge"): strip the quotes.
    StrCpy $R7 $R9 1
    ${If} $R7 == '"'
      StrCpy $R9 $R9 -1 1
    ${EndIf}
    ${If} $R9 == ""
      ; Fall back to the uninstaller's own folder (UninstallString is quoted too).
      StrCpy $R9 $R8 -1 1
      ${GetParent} $R9 $R9
    ${EndIf}

    ; v1.2.1 runs as MediaForge.exe, v1.2.0 as tauri-app.exe.
    !insertmacro KOMPRI_CLOSE_LEGACY_APP "MediaForge.exe" "mf"
    !insertmacro KOMPRI_CLOSE_LEGACY_APP "tauri-app.exe" "ta"

    DetailPrint "Removing previous MediaForge installation from $R9"
    ; /S = silent: never deletes app data; removes its Start Menu / Desktop shortcuts and
    ; its shell\MediaForge Explorer keys. _?= runs the uninstaller in place so ExecWait
    ; really waits for it.
    StrCpy $R7 ""
    ClearErrors
    ExecWait '$R8 /S _?=$R9' $R7

    ${If} ${Errors}
      ; The uninstaller is missing or cannot start: remove the known program files directly.
      DetailPrint "MediaForge uninstaller could not be started, removing its files directly"
      ${If} $R9 != ""
      ${AndIf} ${FileExists} "$R9\*.*"
        Delete "$R9\MediaForge.exe"
        Delete "$R9\tauri-app.exe"
        Delete "$R9\ffmpeg.exe"
        Delete "$R9\ffprobe.exe"
        Delete "$R9\uninstall.exe"
        Delete "$R9\_up_\THIRD_PARTY_NOTICES.md"
        Delete "$R9\_up_\licenses\FFmpeg-GPLv3.txt"
        RMDir "$R9\_up_\licenses"
        RMDir "$R9\_up_"
        RMDir "$R9"
      ${EndIf}
      !insertmacro KOMPRI_DELETE_LEGACY_SHORTCUT "$SMPROGRAMS\MediaForge.lnk"
      !insertmacro KOMPRI_DELETE_LEGACY_SHORTCUT "$DESKTOP\MediaForge.lnk"
      DeleteRegKey HKCU "${MEDIAFORGE_UNINSTKEY}"
      DeleteRegKey HKCU "Software\mediaforge\MediaForge"
    ${ElseIf} $R7 != 0
      ; The uninstaller ran but failed: leave its entry so MediaForge can still be
      ; uninstalled from Settings > Apps. Kompri installs side by side in that case.
      DetailPrint "MediaForge uninstaller failed (exit code $R7), leaving MediaForge in place"
    ${Else}
      ; With _?= the uninstaller cannot delete itself or its folder: finish the job.
      Delete "$R9\uninstall.exe"
      RMDir "$R9"
      ; Safety net (the uninstaller normally removed these already).
      !insertmacro KOMPRI_DELETE_LEGACY_SHORTCUT "$SMPROGRAMS\MediaForge.lnk"
      !insertmacro KOMPRI_DELETE_LEGACY_SHORTCUT "$DESKTOP\MediaForge.lnk"
      DeleteRegKey HKCU "${MEDIAFORGE_UNINSTKEY}"
      ; Installer bookkeeping only (previous install dir / language), not user data.
      DeleteRegKey HKCU "Software\mediaforge\MediaForge"
    ${EndIf}
  ${EndIf}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R2
  Pop $R1
  Pop $R0
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KOMPRI_REMOVE_LEGACY_MEDIAFORGE
!macroend

!macro KOMPRI_DELETE_MENU_KEYS NAME
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.mp4\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.mkv\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.avi\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.mov\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.webm\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.mp3\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.flac\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.wav\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.ogg\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.aac\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.m4a\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.png\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpg\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpeg\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.webp\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.bmp\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.tiff\shell\${NAME}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.tif\shell\${NAME}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Explorer context menu (HKCU, written by the app itself): current and legacy names.
  !insertmacro KOMPRI_DELETE_MENU_KEYS "Kompri"
  !insertmacro KOMPRI_DELETE_MENU_KEYS "MediaForge"
!macroend
