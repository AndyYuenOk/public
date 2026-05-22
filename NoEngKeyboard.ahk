; ================================================================
;  NoEngKeyboard.ahk — 自动切换离英文键盘
;  需要: AutoHotkey v2.0+  https://www.autohotkey.com/
;
;  逻辑：每 150ms 检查一次当前窗口的键盘布局，
;        若检测到纯英文键盘 (ENG / 0x0409)，立即切换回
;        上一次使用的非英文输入法。
; ================================================================

#Requires AutoHotkey v2.0
#SingleInstance Force

; ---- 全局状态 ----
global g_lastNonEngLayout := 0   ; 上次非英文布局句柄
global g_enabled           := true
global g_switchCount       := 0

; ---- 托盘图标 & 菜单 ----
TraySetIcon("shell32.dll", 175)   ; 键盘图标
A_IconTip := "NoEngKeyboard — 防英文键盘"
BuildTrayMenu()

; ---- 启动监控定时器 ----
SetTimer(MonitorLayout, 150)

; ================================================================
;  核心：检测并切换
; ================================================================
MonitorLayout() {
    global g_lastNonEngLayout, g_enabled, g_switchCount

    if !g_enabled
        return

    try {
        hwnd   := WinGetID("A")
        tid    := DllCall("GetWindowThreadProcessId", "Ptr", hwnd, "Ptr", 0, "UInt")
        layout := DllCall("GetKeyboardLayout", "UInt", tid, "Ptr")
        langId := layout & 0xFFFF   ; 低16位 = 语言ID

        if (langId = 0x0409) {      ; 英文 US 键盘
            if (g_lastNonEngLayout != 0) {
                ; 向当前活动窗口发送"切换输入法"消息
                PostMessage(0x0050, 0, g_lastNonEngLayout, , "A")
                g_switchCount++
                UpdateTooltipCount()
            }
        } else {
            ; 记住这个非英文布局
            g_lastNonEngLayout := layout
        }
    }
    ; 忽略无活动窗口等异常
}

; ================================================================
;  托盘菜单
; ================================================================
BuildTrayMenu() {
    A_TrayMenu.Delete()
    A_TrayMenu.Add("NoEngKeyboard", (*) => 0)
    A_TrayMenu.Disable("NoEngKeyboard")
    A_TrayMenu.Add()

    if g_enabled
        A_TrayMenu.Add("✅  监控已启用  (点击暂停)", ToggleEnabled)
    else
        A_TrayMenu.Add("⏸  监控已暂停  (点击启用)", ToggleEnabled)

    A_TrayMenu.Add()
    A_TrayMenu.Add("📋  查看统计", ShowStats)
    A_TrayMenu.Add("🔄  重置统计", ResetStats)
    A_TrayMenu.Add()
    A_TrayMenu.Add("❌  退出", (*) => ExitApp())
}

ToggleEnabled(*) {
    global g_enabled
    g_enabled := !g_enabled
    BuildTrayMenu()
    status := g_enabled ? "已启用" : "已暂停"
    TrayTip("NoEngKeyboard", "监控" . status, 2)
}

ShowStats(*) {
    global g_switchCount
    MsgBox(
        "📊 统计信息`n`n已自动切换次数：" . g_switchCount . " 次`n`n"
        . "当前状态：" . (g_enabled ? "运行中 ✅" : "已暂停 ⏸"),
        "NoEngKeyboard",
        0x40
    )
}

ResetStats(*) {
    global g_switchCount
    g_switchCount := 0
    TrayTip("NoEngKeyboard", "统计已重置", 1)
}

UpdateTooltipCount() {
    global g_switchCount
    A_IconTip := "NoEngKeyboard — 已切换 " . g_switchCount . " 次"
}

; ================================================================
;  快捷键：Alt+Shift+P 临时暂停/恢复（可自行修改）
; ================================================================
!+p:: ToggleEnabled()
