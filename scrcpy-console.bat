@echo off

setlocal EnableDelayedExpansion
@REM set subnet=
set subnet=192.168.71.

@REM adb daemon init
adb devices > nul

@REM find online device
for /f "delims=" %%i in ('adb devices^|findstr "5555.*device"') do set device=%%i
@REM echo device=%device% & pause

for /f %%i in ("%device%") do set tcpip=%%i
@REM echo tcpip=%tcpip% & pause

@REM try to connect
if not defined device (
    set /p host=host:%subnet%
    set host=%subnet%!host!
    set tcpip=!host!
    @REM echo host=!host! & pause

    echo connecting...
    start adb connect !host!
    timeout /t 3 /nobreak > nul

    @REM check device
    for /f "delims=" %%i in ('adb devices^|findstr "5555.*device"') do set device=%%i

    if not defined device (
        adb kill-server

        @REM first time connection port
        set /p port=port:
        adb connect !host!:!port!

        @REM reset port and reconnect
        adb tcpip 5555
        adb connect !host!
    )
)

@REM echo tcpip=%tcpip% & pause

scrcpy.exe --tcpip=%tcpip% -m 1000 --max-fps=60 -Sw --raw-key-events --pause-on-exit=if-error %*
