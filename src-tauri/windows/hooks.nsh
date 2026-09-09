!macro NSIS_HOOK_PREINSTALL
  ; Release file locks held by an older installation before files are copied.
  ; Ignore errors when the processes are not running.
  nsExec::ExecToLog 'taskkill /F /T /IM collector.exe'
  nsExec::ExecToLog 'taskkill /F /T /IM "Shioaji Private Market.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM shioaji-private-market.exe'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Also release locks during uninstall.
  nsExec::ExecToLog 'taskkill /F /T /IM collector.exe'
  nsExec::ExecToLog 'taskkill /F /T /IM "Shioaji Private Market.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM shioaji-private-market.exe'
!macroend
