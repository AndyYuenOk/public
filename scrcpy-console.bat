@echo off

setlocal EnableDelayedExpansion
@REM set subnet=
set subnet=192.168.71.

@REM adb daemon init
adb devices > nul

:main
    @REM add or select device
    echo 1: add device
    set /a count=2
    for /f %%i in ('adb devices^|findstr "5555.*device"') do (
        echo !count!: %%i
        set devices[!count!]=%%i
        set /a count += 1
    )

    @REM no devices
    if not defined devices[2] goto addDevice

    set /a index=2
    set /p index=index [deafault 2]:

    if %index% == 1 goto addDevice

    @REM echo !devices[%index%]! & pause
    if defined devices[%index%] (
        @REM set tcpip
        for /f %%i in ("!devices[%index%]!") do set tcpip=%%i
        @REM echo tcpip=!tcpip! & pause

        scrcpy.exe --tcpip=!tcpip! -m 1000 --max-fps=60 -Sw --raw-key-events --pause-on-exit=if-error %*

        @REM new line
        echo. & goto main
    ) else (
        echo index error & echo. & goto main
    )

:addDevice
    set /p host=host:%subnet%

    if not defined host echo. & goto main

    set host=%subnet%!host!
    set tcpip=!host!
    @REM echo host=!host! & pause

    echo connecting...
    start adb connect !host!
    timeout /t 3 /nobreak > nul

    @REM check device
    for /f "delims=" %%i in ('adb devices^|findstr "%host%:5555.*device"') do set device=%%i

    if not defined device (
        adb kill-server

        @REM first time connection port
        set /p port=port:
        adb connect !host!:!port!

        @REM reset port and reconnect
        adb tcpip 5555
        adb connect !host!
    )
goto main
