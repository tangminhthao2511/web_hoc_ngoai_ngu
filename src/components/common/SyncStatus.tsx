import { useState } from 'react';
import { useLearning } from '../../context/LearningContext';

export function downloadProgress(state: unknown, label = 'backup') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `meowlanguage-${label}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SyncStatus() {
  const { state, sync, retrySync, reloadRemoteProgress, hasLegacyProgress, importLegacyProgress } = useLearning();
  const [confirmImport, setConfirmImport] = useState(false);
  const [importError, setImportError] = useState('');
  const labels = { loading: 'Đang tải tiến độ…', local: 'Chế độ khách · Tiến độ lưu trên thiết bị', saved: 'Đã lưu tiến độ vào tài khoản', saving: 'Đang lưu tiến độ…', error: 'Tiến độ chưa đồng bộ', conflict: 'Tiến độ đã thay đổi trên thiết bị khác' };
  return <div className="mb-4 space-y-2 rounded-2xl border border-black/10 bg-white p-3 text-xs" aria-live="polite">
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-semibold">{labels[sync.status]}</span>
      {sync.status === 'error' && <button className="underline" onClick={() => void retrySync()}>Thử lưu lại</button>}
      {['error', 'conflict'].includes(sync.status) && <button className="underline" onClick={() => downloadProgress(state, 'device-backup')}>Xuất bản sao thiết bị</button>}
      {sync.status === 'conflict' && <button className="underline" onClick={() => void reloadRemoteProgress()}>Tải tiến độ trên tài khoản</button>}
    </div>
    {sync.error && <p role="alert" className="text-amber-800">{sync.error}</p>}
    {sync.status !== 'local' && hasLegacyProgress && !sync.imported && <div className="border-t border-black/10 pt-2">
      {confirmImport ? <>
        <p className="mb-2">Thay tiến độ hiện tại bằng dữ liệu trình duyệt cũ? Dữ liệu cũ có thể đã được dùng chung giữa nhiều người. Hãy xuất backup trước nếu cần giữ tiến độ tài khoản.</p>
        <button className="mr-3 underline" onClick={() => downloadProgress(state)}>Xuất backup</button>
        <button className="mr-3 font-bold underline" onClick={() => { if (!importLegacyProgress()) setImportError('Chưa chuyển được dữ liệu. Hãy chờ lưu xong rồi thử lại hoặc dùng file backup.'); else { setConfirmImport(false); setImportError(''); } }}>Xác nhận chuyển dữ liệu cũ</button>
        <button className="underline" onClick={() => setConfirmImport(false)}>Hủy</button>
      </> : <button className="underline" onClick={() => setConfirmImport(true)}>Chuyển tiến độ trình duyệt cũ vào tài khoản này</button>}
      {importError && <p role="alert" className="mt-2 text-amber-800">{importError}</p>}
    </div>}
  </div>;
}
