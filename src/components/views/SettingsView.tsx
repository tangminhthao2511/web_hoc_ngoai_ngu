import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Lock, RotateCcw, Settings as SettingsIcon, Unlock, Upload } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useLearning } from '../../context/LearningContext';

export const SettingsView: React.FC = () => {
  const { state, updateSettings, resetAllProgress, importProgressJSON } = useLearning();

  const [userName, setUserName] = useState(state.settings.userName);
  const [enMin, setEnMin] = useState(state.settings.dailyEnglishMinutes);
  const [jpMin, setJpMin] = useState(state.settings.dailyJapaneseMinutes);
  const [vocabMin, setVocabMin] = useState(state.settings.dailyVocabMinutes);
  const [xpGoal, setXpGoal] = useState(state.settings.dailyXpGoal);
  const [speechRate, setSpeechRate] = useState(state.settings.speechRate);
  const [unlockPreview, setUnlockPreview] = useState(state.settings.unlockAllPreview);

  useEffect(() => {
    setUnlockPreview(state.settings.unlockAllPreview);
  }, [state.settings.unlockAllPreview]);

  const [provider, setProvider] = useState(state.settings.aiConfig.provider);
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => { void apiRequest<{ aiEnabled: boolean }>('/api/config').then(config => setAiEnabled(config.aiEnabled)).catch(() => {}); }, []);

  const [savedToast, setSavedToast] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      userName: userName.trim() || 'Bạn',
      dailyEnglishMinutes: enMin,
      dailyJapaneseMinutes: jpMin,
      dailyVocabMinutes: vocabMin,
      dailyXpGoal: xpGoal,
      speechRate,
      unlockAllPreview: unlockPreview,
      aiConfig: {
        provider,
        apiKey: '', model: '', endpoint: '',
      },
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, aiConfig: { ...state.settings.aiConfig, apiKey: '' } } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meowlanguage-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('Thay tiến độ hiện tại bằng file backup này? Hãy xuất backup trước nếu cần giữ dữ liệu hiện tại.')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importProgressJSON(String(reader.result || ''));
      setImportStatus(ok ? '✓ Đã khôi phục dữ liệu thành công!' : '✗ File backup không hợp lệ.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <form
        onSubmit={handleSave}
        className="rounded-[26px] border border-black/10 bg-white p-5 sm:p-7 shadow-soft space-y-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="h-5 w-5 text-[#08090D]" />
            <h1 className="text-2xl font-extrabold text-[#08090D]">Cài đặt & Kế hoạch hàng ngày</h1>
          </div>
          {savedToast && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#D2EED9] px-3 py-1 text-xs font-bold text-[#1B5C32]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã lưu cài đặt
            </span>
          )}
        </div>

        {/* Profile & Daily Routine */}
        <div className="space-y-4 rounded-2xl bg-[#F6F6F4] p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-black/60">
            1. Mục tiêu học tập mỗi ngày (Mặc định 55 phút)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold mb-1">Tên hiển thị</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Mục tiêu XP mỗi ngày</label>
              <input
                type="number"
                min={20}
                max={300}
                value={xpGoal}
                onChange={(e) => setXpGoal(Number(e.target.value) || 50)}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Tiếng Anh (phút/ngày)</label>
              <input
                type="number"
                min={5}
                max={120}
                value={enMin}
                onChange={(e) => setEnMin(Number(e.target.value) || 25)}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Tiếng Nhật (phút/ngày)</label>
              <input
                type="number"
                min={5}
                max={120}
                value={jpMin}
                onChange={(e) => setJpMin(Number(e.target.value) || 20)}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Ôn từ vựng SRS (phút/ngày)</label>
              <input
                type="number"
                min={5}
                max={60}
                value={vocabMin}
                onChange={(e) => setVocabMin(Number(e.target.value) || 10)}
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                Tốc độ đọc âm thanh TTS ({speechRate}x)
              </label>
              <input
                type="range"
                min={0.65}
                max={1.25}
                step={0.05}
                value={speechRate}
                onChange={(e) => setSpeechRate(Number(e.target.value))}
                className="w-full accent-[#08090D] mt-2"
              />
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <label className="block text-xs font-bold text-[#08090D]">
              Chế độ mở khóa lộ trình bài học
            </label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setUnlockPreview(false)}
                className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-left transition ${
                  !unlockPreview
                    ? 'border-[#08090D] bg-white shadow-sm'
                    : 'border-black/10 bg-white/60 hover:bg-white'
                }`}
              >
                <Lock className="h-4 w-4 shrink-0 mt-0.5 text-[#08090D]" />
                <div>
                  <div className="text-xs font-extrabold text-[#08090D]">Học trình tự (Khóa bài sau)</div>
                  <p className="mt-0.5 text-[11px] text-black/60">
                    Hoàn thành bài trước từ trên xuống mới mở khóa bài kế tiếp.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUnlockPreview(true)}
                className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-left transition ${
                  unlockPreview
                    ? 'border-[#1A4F73] bg-[#D7ECF9]/45 shadow-sm'
                    : 'border-black/10 bg-white/60 hover:bg-white'
                }`}
              >
                <Unlock className="h-4 w-4 shrink-0 mt-0.5 text-[#1A4F73]" />
                <div>
                  <div className="text-xs font-extrabold text-[#1A4F73]">Mở tất cả bài & Ghi log %</div>
                  <p className="mt-0.5 text-[11px] text-black/65">
                    Mở tự do toàn bộ bài học, chọn học ở bất kỳ vị trí nào và lưu lại % tiến độ tại bài đó.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-[#F6F6F4] p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-black/60">2. Trợ lý AI</h2>
          <p className="text-xs text-black/60">{aiEnabled
            ? 'AI trực tiếp hỗ trợ tối đa 30 câu hỏi mỗi ngày cho mỗi tài khoản. Chế độ demo hoạt động miễn phí trên thiết bị.'
            : 'AI trực tiếp chưa được bật. Bạn vẫn có thể sử dụng phản hồi demo miễn phí.'}</p>
          <select value={provider === 'demo' ? 'demo' : 'openai_compatible'} onChange={event => setProvider(event.target.value as 'demo' | 'openai_compatible')} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
            <option value="demo">Demo cục bộ</option>
            <option value="openai_compatible" disabled={!aiEnabled}>AI trực tiếp</option>
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-[#08090D] px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            Lưu thay đổi
          </button>
        </div>
      </form>

      {/* Backup & Reset */}
      <div className="rounded-[26px] border border-black/10 bg-white p-5 sm:p-6 shadow-soft space-y-4">
        <h2 className="text-base font-extrabold text-[#08090D]">Sao lưu & Khôi phục tiến độ</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#D7ECF9] px-4 py-2 text-xs font-extrabold text-[#1A4F73]"
          >
            <Download className="h-3.5 w-3.5" /> Xuất file Backup (.json)
          </button>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#EEEEEB] px-4 py-2 text-xs font-extrabold text-[#08090D] hover:bg-[#E2E2DE]">
            <Upload className="h-3.5 w-3.5" /> Khôi phục từ file
            <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
          </label>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#F7DCE1] px-4 py-2 text-xs font-extrabold text-[#7D233B]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Đặt lại toàn bộ tiến độ
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-bold text-[#7D233B]">Chắc chắn xóa hết?</span>
              <button
                type="button"
                onClick={() => {
                  resetAllProgress();
                  setConfirmReset(false);
                }}
                className="rounded-full bg-[#DC5F80] px-3.5 py-1.5 text-xs font-bold text-white"
              >
                Xác nhận xóa
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-full bg-[#EEEEEB] px-3.5 py-1.5 text-xs font-bold"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
        {importStatus && <p className="text-xs font-semibold text-[#1B5C32]">{importStatus}</p>}
      </div>
    </div>
  );
};
