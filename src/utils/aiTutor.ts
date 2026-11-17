import { apiRequest } from '../services/api';
import { AIConfig, Language } from '../types';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modeUsed: 'live_api' | 'local_demo';
  timestamp: number;
}

export async function askLanguageAssistant(
  lang: Language,
  prompt: string,
  userLevelLabel: string,
  aiConfig: AIConfig
): Promise<{ reply: string; modeUsed: 'live_api' | 'local_demo'; errorNote?: string }> {
  if (aiConfig.provider !== 'demo') {
    try {
      return await apiRequest<{ reply: string; modeUsed: 'live_api' }>('/api/ai/tutor', {
        method: 'POST', body: JSON.stringify({ language: lang, prompt, level: userLevelLabel }),
      });
    } catch (error) {
      return {
        reply: generateSmartDemoResponse(lang, prompt, userLevelLabel), modeUsed: 'local_demo',
        errorNote: error instanceof Error ? error.message : 'Không kết nối được AI. Đang hiển thị phản hồi mẫu.',
      };
    }
  }
  return { reply: generateSmartDemoResponse(lang, prompt, userLevelLabel), modeUsed: 'local_demo' };
}

function generateSmartDemoResponse(lang: Language, rawInput: string, levelLabel: string): string {
  const q = rawInput.toLowerCase();

  if (lang === 'en') {
    const notes: string[] = [];

    if (q.includes('suggest') && q.includes('to ')) {
      notes.push(
        '• **Lỗi phổ biến (suggest):** Không dùng `suggest someone to do something`. Hãy đổi sang:\n  - `I suggest that we review the plan.`\n  - `I suggest reviewing the plan.`'
      );
    }
    if (q.includes('informations') || q.includes('advices') || q.includes('equipments')) {
      notes.push(
        '• **Danh từ không đếm được:** `information`, `advice`, `equipment` không thêm `-s`. Để đếm dùng `a piece of advice / information`.'
      );
    }
    if (q.includes('depend of')) {
      notes.push('• **Giới từ:** Dùng `depend on` (không dùng `depend of`).');
    }
    if (q.includes('i am agree') || q.includes("i'm agree")) {
      notes.push('• **Động từ agree:** `agree` là động từ, không đi với `am/is/are`. Nói `I agree with you` hoặc mức B2: `I completely share your view.`');
    }
    if (q.includes('inversion') || q.includes('đảo ngữ')) {
      notes.push(
        '• **Đảo ngữ B2 (Inversion):** Đặt trạng từ phủ định lên đầu câu rồi đảo trợ động từ:\n  - `Not only did she pass B2, but she also started N5.`\n  - `Never have I seen such clear progress.`'
      );
    }
    if (q.includes('conditional') || q.includes('điều kiện')) {
      notes.push(
        '• **Mixed Conditional (Điều kiện hỗn hợp B2):**\n  - `If I had practiced speaking earlier (quá khứ), I would feel more confident now (hiện tại).`'
      );
    }
    if (q.includes('hội thoại') || q.includes('conversation') || q.includes('roleplay')) {
      notes.push(
        '• **Tình huống luyện nói B2 (Workplace Sync):**\n  - **Manager:** *"We’re behind schedule on the client deck. What’s your take?"*\n  - **Gợi ý trả lời B2:** *"Admittedly, the timeline is tight; however, if we streamline the slides and delegate the charts, we can meet Friday’s deadline."*'
      );
    }

    if (notes.length === 0) {
      notes.push(
        `• **Gợi ý nâng cấp văn phong (${levelLabel} → B2):**\n  - Thay vì *"very important"* → dùng **crucial / essential**.\n  - Thay vì *"make a decision"* → giữ nguyên **make a decision** hoặc **reach a consensus** (đạt đồng thuận).\n  - Dùng từ nối B2 như **Nevertheless, Consequently, From my perspective** để liên kết ý mạch lạc.`
      );
    }

    return [
      `📘 **Trợ lý Tiếng Anh (Demo cục bộ • Mục tiêu ${levelLabel} → B2)**`,
      ...notes,
      `\n_Lưu ý: Đây là phản hồi mẫu phân tích quy tắc cục bộ. Bạn có thể bật chế độ AI trực tiếp trong **Cài đặt** khi dịch vụ đã sẵn sàng._`,
    ].join('\n\n');
  }

  // JAPANESE
  const jpNotes: string[] = [];
  if (q.includes('は') || q.includes('が') || q.includes('trợ từ') || q.includes('particle')) {
    jpNotes.push(
      '• **Phân biệt は (wa) và が (ga) mức N5:**\n  - **は** đánh dấu chủ đề chung của câu (Thông tin đã biết): `わたしは がくせいです。` (Watashi wa gakusei desu — Tôi là sinh viên).\n  - **が** nhấn mạnh chủ thể hoặc đi với tính từ thích/ghét/giỏi: `わたしは にほんごが すきです。` (Tôi thích tiếng Nhật).'
    );
  }
  if (q.includes('で') || q.includes('に')) {
    jpNotes.push(
      '• **Phân biệt で (de) và に (ni):**\n  - **で**: Nơi diễn ra hành động (`としょかんで べんきょうします` — học ở thư viện) hoặc phương tiện (`でんしゃで いきます` — đi bằng tàu).\n  - **に**: Thời gian cụ thể (`7じに おきます`) hoặc vị trí tồn tại với `あります/います` (`つくえの うえに あります`).'
    );
  }
  if (q.includes('hội thoại') || q.includes('gọi món') || q.includes('conversation')) {
    jpNotes.push(
      '• **Hội thoại mẫu N5 (Tại quán ăn):**\n  - **Nhân viên:** いらっしゃいませ。(Irasshaimase — Kính chào quý khách!)\n  - **Bạn:** すみません、ラーメンを ひとつと おみずを ください。(Sumimasen, raamen o hitotsu to omizu o kudasai — Cho tôi 1 tô ramen và nước lọc ạ.)'
    );
  }
  if (q.includes('kanji') || q.includes('chữ hán')) {
    jpNotes.push(
      '• **Mẹo nhớ Kanji cho người Việt:**\n  - Luôn gắn Kanji với **âm Hán Việt** trước: `学校` = HỌC HIỆU (trường học), `天気` = THIÊN KHÍ (thời tiết), `電車` = ĐIỆN XA (tàu điện). Cách này giúp đoán nghĩa từ mới nhanh gấp đôi!'
    );
  }

  if (jpNotes.length === 0) {
    jpNotes.push(
      `• **Hướng dẫn nhanh Tiếng Nhật (${levelLabel} → JLPT N5):**\n  - Cấu trúc câu chuẩn luôn đặt động từ/です ở **cuối câu**: "[Chủ đề] は [Thời gian] に [Địa điểm] で [Tân ngữ] を [Động từます]。"\n  - Ví dụ: "わたしは まいあさ うちで コーヒーを のみます。" (Watashi wa maiasa uchi de koohii o nomimasu — Mỗi sáng tôi uống cà phê ở nhà).`
    );
  }

  return [
    `🌸 **Trợ lý Tiếng Nhật (Demo cục bộ • Mục tiêu ${levelLabel} → N5)**`,
    ...jpNotes,
    `\n_Lưu ý: Đây là phản hồi mẫu phân tích quy tắc cục bộ. Để AI sửa mọi câu tự do theo thời gian thực, hãy bật chế độ AI trực tiếp trong mục **Cài đặt** khi dịch vụ đã sẵn sàng._`,
  ].join('\n\n');
}
