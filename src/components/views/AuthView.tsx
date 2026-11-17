import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Eye,
  EyeOff,
  Languages,
  Layers,
  Lock,
  Mail,
  Sparkles,
  User,
} from 'lucide-react';
import { Language } from '../../types';
import {
  AuthUserSession,
  loginAsGuest,
  loginWithEmail,
  registerAccount,
  loginWithGoogle,
} from '../../utils/auth';
import { apiRequest } from '../../services/api';
import { MascotAvatar } from '../common/MascotAvatar';

interface Props {
  onAuthenticated: (session: AuthUserSession) => void;
}

export const AuthView: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredLang, setPreferredLang] = useState<Language>('en');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleLogin, setGoogleLogin] = useState(false);
  useEffect(() => { void apiRequest<{ googleLogin: boolean }>('/api/config').then(config => setGoogleLogin(config.googleLogin)).catch(() => {}); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (busy) return;
    if (mode === 'register' && password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      const res = mode === 'login'
        ? await loginWithEmail({ email, password, remember })
        : await registerAccount({ name, email, password, preferredLanguage: preferredLang });
      if (!res.ok) { setErrorMsg(res.error); return; }
      onAuthenticated(res.session);
    } finally { setBusy(false); }
  };

  const handleGuestLogin = () => {
    const guest = loginAsGuest(preferredLang);
    onAuthenticated(guest);
  };

  return (
    <div className="min-h-screen bg-[#08090D] p-3 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="w-full max-w-[1120px] rounded-[32px] bg-[#F6F6F4] p-3 sm:p-5 shadow-2xl border border-white/10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-stretch">
          {/* Left Hero Showcase Panel */}
          <div className="lg:col-span-5 rounded-[26px] bg-[#08090D] p-6 sm:p-8 text-white flex flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <MascotAvatar size={46} />
                <div>
                  <div className="text-xl font-extrabold tracking-tight text-white">MeowLanguage</div>
                  <div className="text-xs text-white/60">Học Tiếng Anh B1→B2 & Tiếng Nhật N5</div>
                </div>
              </div>

              <div className="space-y-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#D7ECF9]">
                  <Sparkles className="h-3.5 w-3.5" /> Tách biệt 2 luồng học thông minh
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight">
                  Chinh phục song ngữ mỗi ngày với lộ trình cá nhân hóa.
                </h1>
                <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                  Lưu tiến độ học tập, Flashcards lặp lại ngắt quãng (SRS), phát âm 44 âm IPA, bài đọc hiểu dài và kho 820+ từ vựng Anh – Nhật ngay trên trình duyệt.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3 rounded-2xl bg-white/8 p-3 border border-white/10">
                  <div className="h-9 w-9 rounded-xl bg-[#D7ECF9] text-[#1A4F73] flex items-center justify-center shrink-0">
                    <AudioLines className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold">Tiếng Anh B1+ → B2</div>
                    <div className="text-[11px] text-white/65">
                      520 từ vựng kèm họ từ, 44 âm IPA & 9 bài đọc dài
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-white/8 p-3 border border-white/10">
                  <div className="h-9 w-9 rounded-xl bg-[#E5D9F7] text-[#4B2C7A] flex items-center justify-center shrink-0">
                    <Languages className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold">Tiếng Nhật 0 → JLPT N5</div>
                    <div className="text-[11px] text-white/65">
                      92+ Kana, 110 chữ Hán Kanji & 300 từ vựng thiết yếu
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-white/8 p-3 border border-white/10">
                  <div className="h-9 w-9 rounded-xl bg-[#D2EED9] text-[#1B5C32] flex items-center justify-center shrink-0">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold">Mở khóa linh hoạt & Lưu % tiến độ</div>
                    <div className="text-[11px] text-white/65">
                      Tự chọn học tuần tự từ trên xuống hoặc mở toàn bộ bài học
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-[11px] text-white/75 leading-relaxed">
              <div className="font-extrabold text-white/95">Học đều mỗi ngày cùng MeowLanguage</div>
              <p className="mt-0.5 text-white/65">
                Tiến độ từ vựng, Word Family, Reading, IPA và Kanji được lưu tự động ngay trên trình duyệt của bạn.
              </p>
            </div>
          </div>

          {/* Right Auth Form Panel */}
          <div className="lg:col-span-7 rounded-[26px] bg-white p-6 sm:p-9 border border-black/8 flex flex-col justify-between">
            <div>
              {/* Login / Register Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-full bg-[#F6F6F4] p-1 border border-black/8">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg('');
                    }}
                    className={`rounded-full px-5 py-2 text-xs sm:text-sm font-extrabold transition ${
                      mode === 'login' ? 'bg-[#08090D] text-white' : 'text-black/60 hover:text-[#08090D]'
                    }`}
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg('');
                    }}
                    className={`rounded-full px-5 py-2 text-xs sm:text-sm font-extrabold transition ${
                      mode === 'register'
                        ? 'bg-[#08090D] text-white'
                        : 'text-black/60 hover:text-[#08090D]'
                    }`}
                  >
                    Tạo tài khoản
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <h2 className="text-2xl font-extrabold text-[#08090D]">
                  {mode === 'login' ? 'Chào mừng quay lại MeowLanguage!' : 'Bắt đầu hành trình mới'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-black/60">
                  {mode === 'login'
                    ? 'Đăng nhập để tiếp tục chuỗi ngày học, kiểm tra XP và từ vựng đến hạn.'
                    : 'Tạo tài khoản cá nhân để đồng bộ tên học viên và chọn ngôn ngữ ưu tiên.'}
                </p>
              </div>

              {errorMsg && (
                <div className="mt-4 rounded-2xl border border-[#7D233B]/20 bg-[#F7DCE1]/70 px-4 py-3 text-xs font-bold text-[#7D233B]">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {mode === 'register' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-[#08090D]">
                      Tên hiển thị của bạn
                    </label>
                    <div className="flex items-center gap-2.5 rounded-2xl border border-black/12 bg-[#F6F6F4] px-3.5 py-2.5 focus-within:border-[#08090D] focus-within:bg-white transition">
                      <User className="h-4 w-4 text-black/45 shrink-0" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Minh Thảo"
                        className="w-full bg-transparent text-sm font-medium text-[#08090D] outline-none"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-[#08090D]">
                    Email
                  </label>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-black/12 bg-[#F6F6F4] px-3.5 py-2.5 focus-within:border-[#08090D] focus-within:bg-white transition">
                    {mode === 'login' ? (
                      <User className="h-4 w-4 text-black/45 shrink-0" />
                    ) : (
                      <Mail className="h-4 w-4 text-black/45 shrink-0" />
                    )}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-transparent text-sm font-medium text-[#08090D] outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-[#08090D]">Mật khẩu</label>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-black/12 bg-[#F6F6F4] px-3.5 py-2.5 focus-within:border-[#08090D] focus-within:bg-white transition">
                    <Lock className="h-4 w-4 text-black/45 shrink-0" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'Tối thiểu 8 ký tự' : 'Nhập mật khẩu'}
                      className="w-full bg-transparent text-sm font-medium text-[#08090D] outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-black/45 hover:text-[#08090D]"
                      aria-label="Hiện hoặc ẩn mật khẩu"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-extrabold text-[#08090D]">
                        Nhập lại mật khẩu
                      </label>
                      <div className="flex items-center gap-2.5 rounded-2xl border border-black/12 bg-[#F6F6F4] px-3.5 py-2.5 focus-within:border-[#08090D] focus-within:bg-white transition">
                        <Lock className="h-4 w-4 text-black/45 shrink-0" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Xác nhận mật khẩu"
                          className="w-full bg-transparent text-sm font-medium text-[#08090D] outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-extrabold text-[#08090D]">
                        Luồng ngôn ngữ ưu tiên khi bắt đầu
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setPreferredLang('en')}
                          className={`rounded-2xl border p-3 text-left text-xs font-extrabold transition ${
                            preferredLang === 'en'
                              ? 'border-[#1A4F73] bg-[#D7ECF9] text-[#1A4F73]'
                              : 'border-black/10 bg-[#F6F6F4] text-black/70'
                          }`}
                        >
                          🇬🇧 Tiếng Anh (B1 → B2)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreferredLang('jp')}
                          className={`rounded-2xl border p-3 text-left text-xs font-extrabold transition ${
                            preferredLang === 'jp'
                              ? 'border-[#4B2C7A] bg-[#E5D9F7] text-[#4B2C7A]'
                              : 'border-black/10 bg-[#F6F6F4] text-black/70'
                          }`}
                        >
                          🇯🇵 Tiếng Nhật (0 → N5)
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-black/70 font-semibold">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#08090D]"
                      />
                      Ghi nhớ đăng nhập trên trình duyệt này
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#08090D] px-6 py-3 text-sm font-extrabold text-white hover:opacity-90 transition shadow-sm"
                >
                  <span>{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập vào học ngay' : 'Hoàn tất đăng ký'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
              {googleLogin && <button type="button" disabled={busy} className="mt-3 w-full rounded-full border border-black/20 px-4 py-3 font-bold" onClick={async () => {
                setBusy(true);
                try { await loginWithGoogle(); } catch { setErrorMsg('Không đăng nhập được bằng Google.'); setBusy(false); }
              }}>Tiếp tục với Google</button>}
            </div>

            {/* Footer Guest Mode */}
            <div className="mt-6 border-t border-black/8 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-black/55 inline-flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Đăng nhập để đồng bộ tiến độ giữa các thiết bị.
              </span>
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={busy}
                className="font-extrabold text-[#08090D] underline underline-offset-2 hover:text-[#1A4F73]"
              >
                Vào học thử không cần tài khoản →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
