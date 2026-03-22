import sys

import cv2
import easyocr
import mss
import numpy
import numpy as np
import pytesseract
import pyperclip
from PyQt6.QtWidgets import QApplication, QWidget, QPushButton, QVBoxLayout, QTextEdit, QLabel, QHBoxLayout, QSizeGrip, \
    QSizePolicy
from PyQt6.QtCore import Qt, QTimer, QRectF, QPoint, QObject, QEvent
from PyQt6.QtGui import QPainter, QColor, QPen, QCursor, QFont
from PIL import ImageGrab

# 指定 Tesseract 路径
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


class RealTimeOCR(QWidget):
    def __init__(self):
        super().__init__()
        self.is_top = True
        self.last_text = ""  # 记录上一次识别的内容
        self.is_realtime = False  # 实时模式状态
        self.is_show_results = False
        self.initUI()

        # 初始化定时器
        self.timer = QTimer()
        self.timer.timeout.connect(self.run_ocr)

    def initUI(self):
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.resize(600, 150)
        # 获取屏幕可用尺寸
        screen = QApplication.primaryScreen()
        screen_geo = screen.availableGeometry()  # 不包括任务栏
        screen_width = screen_geo.width()
        screen_height = screen_geo.height()

        # 窗口大小
        win_width = self.width()
        win_height = self.height()

        # 计算位置：水平居中，垂直靠底部
        x = (screen_width - win_width) // 2
        y = screen_height - win_height - 50  # 离底部 50px
        self.setGeometry(x, y, win_width, win_height)

        layout = QVBoxLayout()
        layout.setSpacing(0)
        layout.setContentsMargins(0, 0, 0, 0)

        self.label1 = QLabel()
        self.label1.setStyleSheet("background: rgba(0, 0, 0, 2);")
        self.label1.installEventFilter(self)
        layout.addWidget(self.label1)

        # 顶部状态条
        self.label = QLabel()
        # self.label.setFixedHeight(5)
        # self.label.setStyleSheet("background: rgba(0, 0, 0, 99)")
        # self.label.setText('afaweeeee ewfewfw')
        self.label.setWordWrap(True)
        font = QFont()
        font.setPointSize(15)
        font.setBold(True)
        self.label.setFont(font)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet("background:transparent;border:1px solid red;")
        self.label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)  # 允许鼠标选中
        layout.addWidget(self.label, 1)
        # self.label.installEventFilter(self)

        # self.label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)
        # layout.addWidget(self.label)

        # 给 label 安装事件过滤器
        # self.label.installEventFilter(self)

        # 透明区域（识别区）
        # self.work_area = QWidget()
        # self.work_area.setStyleSheet("background: rgba(0, 0, 0, 2);border: 1px solid red;")
        # layout.addWidget(self.work_area, 1)
        # self.work_area.installEventFilter(self)

        # 结果实时显示框
        # self.result_box = QTextEdit()
        # self.result_box.setPlaceholderText("等待识别...")
        # self.result_box.setMaximumHeight(100)
        # self.result_box.setStyleSheet("background: rgba(8, 8, 8, 75);color:white;")
        # layout.addWidget(self.result_box)

        # 按钮栏
        btn_layout = QHBoxLayout()

        self.btn_toggle = QPushButton("实时识别")
        self.btn_toggle.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.btn_toggle.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_toggle.setStyleSheet("padding:5px;background:#6c757d;font:bold;color:white")
        self.btn_toggle.clicked.connect(self.toggle_mode)

        self.btn_show = QPushButton("显示结果")
        self.btn_show.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.btn_show.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_show.setStyleSheet("padding:5px;background:#6c757d;font:bold;color:white")
        self.btn_show.clicked.connect(self.show_results)

        self.btn_copy = QPushButton("识别复制")
        self.btn_copy.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.btn_copy.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_copy.setStyleSheet("padding:5px;background:#0d6efd;font:bold;color:white")
        self.btn_copy.clicked.connect(self.recognize_copy)

        self.btn_close = QPushButton("退出")
        self.btn_close.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_close.setStyleSheet("padding:5px;background:#dc3545;font:bold;color:white")
        self.btn_close.clicked.connect(self.close)

        self.btn_top = QPushButton("置顶")
        self.btn_top.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.btn_top.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_top.setStyleSheet("padding:5px;background:#198754;font:bold;color:white")
        self.btn_top.clicked.connect(self.set_top)

        btn_layout.addStretch(1)
        btn_layout.addWidget(self.btn_close)
        btn_layout.addWidget(self.btn_top)
        btn_layout.addWidget(self.btn_toggle)
        btn_layout.addWidget(self.btn_show)
        btn_layout.addWidget(self.btn_copy)
        layout.addLayout(btn_layout)

        # 添加缩放手柄到右下角
        size_grip = QSizeGrip(self)
        layout.addWidget(size_grip, 0, Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignBottom)

        self.setLayout(layout)

    def show_results(self):
        self.is_show_results = not self.is_show_results
        if not self.is_show_results:
            self.label.setText("")
        color = "198754" if self.is_show_results else "6c757d"
        self.btn_show.setStyleSheet(f"padding:5px;background:#{color};font:bold;color:white")

    def set_top(self):
        self.is_top = not self.is_top
        color = "198754" if self.is_top else "6c757d"
        self.btn_top.setStyleSheet(f"padding:5px;background:#{color};font:bold;color:white")
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, self.is_top)
        self.show()  # 必须重新 show 才会生效

    # 在你的类里添加事件过滤器方法
    def eventFilter(self, obj: QObject, event: QEvent):
        if obj == self.label1:
            if event.type() == QEvent.Type.Enter:
                # 鼠标悬停，改为四向箭头
                self.setCursor(QCursor(Qt.CursorShape.SizeAllCursor))
            elif event.type() == QEvent.Type.Leave:
                # 鼠标离开，恢复默认箭头
                self.setCursor(QCursor(Qt.CursorShape.ArrowCursor))
        return super().eventFilter(obj, event)

    # def paintEvent(self, event):
    #     painter = QPainter(self)
    #     # 实时模式用橙色边框，手动模式用蓝色
    #     color = QColor(255, 165, 0) if self.is_realtime else QColor(52, 152, 219)
    #     painter.setPen(QPen(color, 4))
    #     painter.drawRect(self.rect())

    def recognize_copy(self):
        self.btn_copy.setText("正在识别")
        # self.btn_copy.setStyleSheet("background:#0d6efd;font:bold;color:white")
        self.label.setText("")
        QApplication.processEvents()
        self.run_ocr()
        # pyperclip.copy(self.result_box.toPlainText())

        self.btn_copy.setText("复制成功")
        self.btn_copy.setStyleSheet("padding:5px;background:#198754;font:bold;color:white")

        # 1秒后恢复原状
        QTimer.singleShot(
            3000,
            lambda: (self.btn_copy.setText("识别复制"),
                     self.btn_copy.setStyleSheet("padding:5px;background:#0d6efd;font:bold;color:white"))
        )

    def toggle_mode(self):
        self.is_realtime = not self.is_realtime
        if self.is_realtime:
            self.btn_toggle.setText("停止实时识别")
            self.btn_toggle.setStyleSheet("background-color: #f39c12; color: white; padding: 8px; font-weight: bold;")
            # self.label.setText("模式：🔴 实时识别中...")
            self.timer.start(500)  # 每 600 毫秒识别一次
        else:
            self.btn_toggle.setText("开启实时识别")
            self.btn_toggle.setStyleSheet("background-color: #2ecc71; color: white; padding: 8px; font-weight: bold;")
            # self.label.setText("模式：手动")
            self.timer.stop()

    def run_ocr(self):

        try:
            # 1. 动态获取“识别区”在屏幕上的精确位置和大小
            # mapToGlobal(QPoint(0,0)) 能准确抓取控件左上角的屏幕坐标
            pos = self.label.mapToGlobal(QPoint(0, 0))
            x = pos.x()
            y = pos.y()
            w = self.label.width()
            h = self.label.height()

            # 2. 处理高分屏（DPI）缩放系数
            # 很多 Windows 默认缩放 125% 或 150%，必须乘以这个系数
            screen = QApplication.primaryScreen()
            ratio = screen.devicePixelRatio()

            # 计算实际截屏物理像素区域
            capture_rect = (
                int(x * ratio),
                int(y * ratio),
                int((x + w) * ratio),
                int((y + h) * ratio)
            )

            monitor = {
                "left": int(x * ratio),
                "top": int(y * ratio),
                "width": int(w * ratio),
                "height": int(h * ratio),
            }
            img = mss.mss().grab(monitor)

            img_np = np.array(img)
            # img = cv2.imread("your_image.png")
            # gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)

            # _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)

            # binary = cv2.medianBlur(binary, 3)
            # 3. 执行截图
            # screenshot = ImageGrab.grab(bbox=capture_rect)

            # 调试小技巧：如果你还是觉得不准，可以取消下面这行的注释，
            # 它会把每次截到的图保存下来，方便你查看截取范围是否正确。
            # mss.tools.to_png(img.rgb, img.size, output="screenshot.png")

            # return

            reader = easyocr.Reader(['en'])

            # 2. 直接识别图片（支持路径、ndarray 或 bytes）
            results = reader.readtext(img_np, detail=0)

            text = "\n".join(results)
            html_text = "<br>".join(
                [f"<span style='background:rgba(8, 8, 8, 0.75);color:white'>{line}</span>" for line in results])
            # 4. Tesseract 识别
            # text = pytesseract.image_to_string(screenshot, lang='eng').strip()

            # if text and text != self.last_text:

            if (self.is_show_results):
                self.label.setText(html_text)

            pyperclip.copy(text)
            self.last_text = text

            print("-" * 50)
            print(text)

        except Exception as e:
            print(f"识别出错: {e}")

    # 鼠标拖动支持
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.old_pos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if hasattr(self, 'old_pos') and self.old_pos:
            delta = event.globalPosition().toPoint() - self.old_pos
            self.move(self.x() + delta.x(), self.y() + delta.y())
            self.old_pos = event.globalPosition().toPoint()


if __name__ == '__main__':
    app = QApplication(sys.argv)
    win = RealTimeOCR()
    win.show()
    sys.exit(app.exec())
