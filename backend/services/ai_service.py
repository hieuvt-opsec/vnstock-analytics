import os
from google import genai
from google.genai import types

def analyze_stock_with_gemini(symbol: str, financial_data: dict, technical_data: list, user_question: str) -> str:
    """
    Sử dụng Google GenAI SDK và mô hình gemini-2.5-flash để phân tích mã cổ phiếu
    dựa trên các thông tin cơ bản và kỹ thuật được cung cấp.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return (
            "### Lỗi cấu hình hệ thống\n\n"
            "Không tìm thấy biến môi trường `GEMINI_API_KEY`. "
            "Vui lòng thiết lập khóa API Gemini của bạn trên máy chủ backend để kích hoạt tính năng AI Agent."
        )

    try:
        # Khởi tạo GenAI Client với api_key
        client = genai.Client(api_key=api_key)

        # 1. Trích xuất chỉ số cơ bản (Fundamentals)
        pe = financial_data.get("pe") if financial_data else None
        pb = financial_data.get("pb") if financial_data else None
        roe = financial_data.get("roe") if financial_data else None
        roa = financial_data.get("roa") if financial_data else None
        
        financials_summary = ""
        if financial_data and financial_data.get("financials"):
            financials_summary = "\nDoanh thu & Lợi nhuận qua các năm gần đây:\n"
            for item in financial_data["financials"][:3]:
                period = item.get("period", "N/A")
                rev = item.get("revenue", "N/A")
                prof = item.get("net_profit", "N/A")
                financials_summary += f"- Năm {period}: Doanh thu {rev} tỷ, LN sau thuế {prof} tỷ\n"

        # 2. Trích xuất chỉ số kỹ thuật hiện tại (Technicals)
        latest_bar = technical_data[-1] if technical_data else {}
        close_price = latest_bar.get("close")
        rsi = latest_bar.get("rsi")
        ma20 = latest_bar.get("ma20")
        ma50 = latest_bar.get("ma50")

        # Quét tìm khoảng trống giá (FVG) gần đây nhất (trong 10 phiên qua)
        last_fvg = None
        if technical_data:
            for bar in reversed(technical_data[-10:]):
                if bar.get("fvg_type") in [1.0, -1.0]:
                    last_fvg = bar
                    break

        fvg_text = "Không có khoảng trống FVG lớn xuất hiện gần đây."
        if last_fvg:
            fvg_type_str = "Bullish FVG (Tăng giá)" if last_fvg.get("fvg_type") == 1.0 else "Bearish FVG (Giảm giá)"
            fvg_text = (
                f"Phát hiện **{fvg_type_str}** tại phiên ngày {last_fvg.get('date')}, "
                f"khoảng giá gap: {last_fvg.get('fvg_bottom'):,} - {last_fvg.get('fvg_top'):,} VND."
            )

        # Xây dựng prompt chi tiết
        prompt = f"""Bạn là một chuyên gia phân tích chứng khoán Việt Nam cao cấp và giàu kinh nghiệm (VNStock Senior Advisor).
Nhiệm vụ của bạn là phân tích mã cổ phiếu **{symbol}** và trả lời câu hỏi của khách hàng một cách chuyên nghiệp, chi tiết dựa trên dữ liệu thực tế được cung cấp dưới đây.

---

### DỮ LIỆU THỰC TẾ HỆ THỐNG CUNG CẤP:

1. Dữ liệu tài chính cơ bản:
- Giá trị định giá P/E: {f"{pe:.2f}" if pe is not None else "Không khả dụng"}
- Giá trị định giá P/B: {f"{pb:.2f}" if pb is not None else "Không khả dụng"}
- Tỷ suất sinh lời ROE: {f"{roe:.2f}%" if roe is not None else "Không khả dụng"}
- Tỷ suất sinh lời ROA: {f"{roa:.2f}%" if roa is not None else "Không khả dụng"}{financials_summary}

2. Dữ liệu phân tích kỹ thuật:
- Giá đóng cửa phiên gần nhất: {f"{close_price:,.0f} VND" if close_price is not None else "Không khả dụng"}
- Chỉ số sức mạnh tương đối RSI (14): {f"{rsi:.2f}" if rsi is not None else "Không khả dụng"} (Ngưỡng tham chiếu: >=70 quá mua, <=30 quá bán)
- Đường trung bình động MA20: {f"{ma20:,.0f} VND" if ma20 is not None else "Không khả dụng"}
- Đường trung bình động MA50: {f"{ma50:,.0f} VND" if ma50 is not None else "Không khả dụng"}
- Khoảng trống giá Fair Value Gap (FVG) gần đây: {fvg_text}

---

### CÂU HỎI CỦA KHÁCH HÀNG:
"{user_question}"

---

### YÊU CẦU PHẢN HỒI:
1. **Trả lời trực tiếp**: Đi thẳng vào câu hỏi của khách hàng, liên hệ trực tiếp với các số liệu thực tế được cung cấp ở trên.
2. **Phân tích kỹ thuật (Technical Analysis)**: 
   - Đánh giá xu hướng ngắn hạn và trung hạn bằng cách so sánh giá với các đường MA20, MA50.
   - Nhận định động lượng giá qua RSI.
   - Giải thích vai trò của tín hiệu FVG gần nhất (nếu có) đối với hỗ trợ/kháng cự.
3. **Phân tích cơ bản (Fundamental Analysis)**: 
   - Đánh giá mức độ đắt/rẻ của cổ phiếu qua P/E và P/B so với mặt bằng chung.
   - Phân tích hiệu quả sử dụng vốn của doanh nghiệp qua ROE, ROA.
4. **Khuyến nghị hành động**: Đưa ra lời khuyên cụ thể (Mua gom/Bán hạ tỷ trọng/Nắm giữ/Theo dõi sát) kèm theo các mốc hỗ trợ và kháng cự tham khảo.
5. **Định dạng**: Trả về câu trả lời bằng tiếng Việt, định dạng Markdown chuẩn, chuyên nghiệp, rõ ràng (dùng tiêu đề, danh sách, hoặc in đậm để nổi bật). Ở cuối câu trả lời, hãy thêm một tuyên bố miễn trừ trách nhiệm ngắn gọn: "Khuyến nghị mang tính chất tham khảo, nhà đầu tư tự chịu trách nhiệm đối với quyết định của mình."

Hãy bắt đầu phân tích ngay:
"""

        # Gọi Gemini API
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"### Lỗi khi gọi Gemini API\n\nĐã xảy ra lỗi trong quá trình kết nối và truy xuất từ Gemini API: {str(e)}"
