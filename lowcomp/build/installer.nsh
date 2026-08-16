; Pins the installation to a fixed folder instead of the per-user default
; (%LOCALAPPDATA%\Programs\...). electron-builder's NSIS template resolves
; $INSTDIR from the InstallLocation registry value, so writing it in preInit —
; which runs before the installer decides where to go — forces C:\games\Chef.
;
; HKLM is written too so an elevated install lands in the same place; without
; admin rights that write simply fails and the HKCU value is the one used.

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\games\Chef"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\games\Chef"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\games\Chef"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\games\Chef"
!macroend
