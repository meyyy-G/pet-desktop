// Qt 通信模块：唯一负责建立 QWebChannel 连接的地方。
// QWebChannel 和 qt 由 Qt WebEngine 注入，不需要从其他 JS 文件导入。

/**
 * 连接 Python 注册的 diaryBridge。
 * @param {(bridge: object) => void} onConnected 连接成功后的回调。
 */
export function connectDiaryBridge(onConnected) {
  new QWebChannel(qt.webChannelTransport, (channel) => {
    onConnected(channel.objects.diaryBridge);
  });
}
