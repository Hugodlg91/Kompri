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
; which never happens in silent mode (/S).

!define MEDIAFORGE_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediaForge"

!macro KOMPRI_REMOVE_LEGACY_MEDIAFORGE
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
      ; Fall back to the uninstaller's own folder.
      StrCpy $R9 $R8 -1 1
      ${GetParent} $R9 $R9
    ${EndIf}

    DetailPrint "Removing previous MediaForge installation from $R9"
    ; /S = silent (no app-data deletion, removes its Start Menu / Desktop shortcuts and
    ; the shell\MediaForge Explorer keys). _?= runs the uninstaller in place so ExecWait
    ; really waits for it.
    ExecWait '$R8 /S _?=$R9' $R7
    DetailPrint "MediaForge uninstaller exit code: $R7"

    ; With _?= the uninstaller cannot delete itself or its folder: finish the job.
    Delete "$R9\uninstall.exe"
    RMDir "$R9"

    ; Safety net if the old uninstaller failed or was not the Tauri one.
    Delete "$SMPROGRAMS\MediaForge.lnk"
    Delete "$DESKTOP\MediaForge.lnk"
    DeleteRegKey HKCU "${MEDIAFORGE_UNINSTKEY}"
    ; Installer bookkeeping only (previous install dir / language), not user data.
    DeleteRegKey HKCU "Software\mediaforge\MediaForge"
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; v1.2.0 shipped the binary as tauri-app.exe
  Delete "$INSTDIR\tauri-app.exe"
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
