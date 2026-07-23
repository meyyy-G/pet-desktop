// 日期工具模块：这里只放不依赖页面元素、不修改全局状态的纯函数。
// 纯函数容易理解，也方便以后单独写测试。

/** 把 Date 转换成 Python 存储层使用的 yyyy-MM-dd 格式。 */
export function toDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** 判断一个 yyyy-MM-dd 日期是否晚于今天。 */
export function isFutureDate(dateText) {
  return dateText > toDateText(new Date());
}

/** 根据小时返回首页问候语使用的时间段。 */
export function getDayPeriod(hour) {
  if (hour >= 0 && hour < 5) return "midnight";
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  return "evening";
}
