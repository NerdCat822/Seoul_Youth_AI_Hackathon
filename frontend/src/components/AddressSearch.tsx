import { useEffect, useRef, useState } from 'react';
import { fromPostcode, loadPostcode } from '../lib/postcode';
import type { StoreAddress } from '../types';

export function AddressSearch({
  onSelected,
  onClose,
}: {
  onSelected: (address: StoreAddress) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    let active = true;
    setError('');
    setReady(false);
    loadPostcode()
      .then((Postcode) => {
        if (!active) return;
        const search = new Postcode({
          width: '100%',
          height: '100%',
          minWidth: 220,
          shorthand: false,
          oncomplete(result) {
            if (!active) return;
            try {
              onSelected(fromPostcode(result));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : '주소를 다시 선택해주세요.');
            }
          },
        });
        search.embed(container, { autoClose: false });
        setReady(true);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '카카오 주소 검색을 열지 못했어요.');
      });
    return () => {
      active = false;
      container.replaceChildren();
    };
  }, [attempt, onSelected]);
  return (
    <dialog
      className="address-dialog"
      ref={dialog}
      aria-labelledby="address-search-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="address-tools">
        <h2 id="address-search-title">가게 주소 검색</h2>
        <button type="button" autoFocus onClick={onClose}>
          닫기
        </button>
      </div>
      {error ? (
        <div className="address-message" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        !ready && (
          <p className="address-message" role="status">
            주소 검색을 열고 있어요…
          </p>
        )
      )}
      <div className="postcode-frame" hidden={!!error} ref={frame} />
    </dialog>
  );
}
