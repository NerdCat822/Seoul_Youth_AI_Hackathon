import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { request } from '../api';
import type { StoreAddress } from '../types';
import { Icon } from './Icon';

interface AddressSuggestion extends StoreAddress {
  postalCode: string;
  roadAddress: string;
  jibunAddress: string;
}

interface SearchResults {
  suggestions: AddressSuggestion[];
  hasMore: boolean;
  coverage: 'national' | 'local';
}

interface SearchReply {
  query: string;
  data: SearchResults | null;
  page: number;
  more?: 'loading' | 'error';
}

function Highlight({ text, query }: { text: string; query: string }) {
  const start = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || start < 0) return <>{text}</>;
  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function AddressSearch({
  selected,
  onSelected,
  error,
  inputClassName,
  placeholder = '예: 여의동, 국회대로',
}: {
  selected: StoreAddress | null;
  onSelected: (address: StoreAddress | null) => void;
  error?: string;
  inputClassName?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const [reply, setReply] = useState<SearchReply | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const query = open && !selected && !composing ? text.trim().normalize('NFC') : '';
  const searching = query.length >= 2;
  const result = searching && reply?.query === query ? reply : null;
  const suggestions = result?.data?.suggestions ?? [];

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request<SearchResults>('/addresses/search?q=' + encodeURIComponent(query), {
        signal: controller.signal,
      }).then(
        (data) => {
          if (!controller.signal.aborted) setReply({ query, data, page: 1 });
        },
        () => {
          if (!controller.signal.aborted) setReply({ query, data: null, page: 1 });
        },
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      moreRequest.current?.abort();
      moreRequest.current = null;
    };
  }, [query, searching, attempt]);

  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  async function loadMore() {
    const previous = result?.data;
    if (!result || !previous?.hasMore || moreRequest.current) return;
    const page = result.page + 1;
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      coverage: previous.coverage,
    });
    const controller = new AbortController();
    moreRequest.current = controller;
    setReply({ ...result, more: 'loading' });
    setActive(-1);
    input.current?.focus();
    try {
      const next = await request<SearchResults>('/addresses/search?' + params, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const combined = previous.suggestions.concat(next.suggestions);
      setReply({ query, page, data: { ...next, suggestions: combined } });
      if (next.suggestions.length) {
        setActive((current) => (current < 0 ? previous.suggestions.length : current));
      }
    } catch {
      if (!controller.signal.aborted) setReply({ ...result, more: 'error' });
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
    }
  }

  function closeList() {
    setOpen(false);
    setActive(-1);
    setReply(null);
  }

  function choose({ address, megaCd, megaNm, ctyCd, ctyNm }: StoreAddress) {
    onSelected({ address, megaCd, megaNm, ctyCd, ctyNm });
    setText(address);
    closeList();
  }

  function edit(value: string) {
    if (selected) onSelected(null);
    setText(value);
    setActive(-1);
    if (value.trim().normalize('NFC') !== text.trim().normalize('NFC')) setReply(null);
    setOpen(true);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape') {
      closeList();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestions[active]) choose(suggestions[active]);
      else if (suggestions.length === 1) choose(suggestions[0]);
      else setOpen(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (suggestions.length) {
        if (event.key === 'ArrowDown') setActive((active + 1) % suggestions.length);
        else setActive(active <= 0 ? suggestions.length - 1 : active - 1);
      }
    }
  }

  let status = '';
  if (searching) {
    if (!result) status = '주소를 찾고 있어요…';
    else if (!result.data) status = '주소 목록을 불러오지 못했어요.';
    else if (!suggestions.length)
      status =
        result.data.coverage === 'local'
          ? '서울 전역과 전주 여의동 일대에서 일치하는 주소를 찾지 못했어요.'
          : '검색 결과가 없어요. 지역명이나 도로명·건물번호를 입력해주세요.';
    else if (result.more === 'loading') status = '다음 주소를 찾고 있어요…';
    else if (result.more === 'error') status = '다음 주소를 불러오지 못했어요.';
    else if (result.data.coverage === 'local') status = '서울 전역과 전주 여의동 일대의 주소예요.';
  }

  return (
    <div
      className="address-lookup"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeList();
      }}
    >
      <div className="address-input-wrap">
        <Icon name="search" size={20} />
        <input
          ref={input}
          id="auth-address"
          name="address"
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder={placeholder}
          className={inputClassName}
          maxLength={100}
          value={selected?.address ?? text}
          aria-autocomplete="list"
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? 'address-error' : undefined}
          aria-expanded={suggestions.length > 0}
          aria-controls="address-options"
          aria-activedescendant={suggestions[active] ? 'address-option-' + active : undefined}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onCompositionStart={() => {
            setComposing(true);
            setActive(-1);
            setReply(null);
          }}
          onCompositionEnd={() => setComposing(false)}
          onChange={(event) => edit(event.target.value)}
          onKeyDown={keyDown}
        />
        {(text || selected) && (
          <button
            type="button"
            className="address-clear"
            aria-label="주소 지우기"
            onClick={() => {
              edit('');
              input.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      <ul
        ref={list}
        id="address-options"
        role="listbox"
        aria-label="주소 검색 결과"
        className="address-options"
        hidden={!suggestions.length}
      >
        {suggestions.map((item, index) => (
          <li
            key={[item.address, item.jibunAddress, item.postalCode, index].join('|')}
            id={'address-option-' + index}
            role="option"
            aria-selected={active === index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
          >
            <strong>
              <Highlight text={item.roadAddress || item.address} query={query} />
            </strong>
            {item.jibunAddress && (
              <small>
                <Highlight text={item.jibunAddress} query={query} />
              </small>
            )}
          </li>
        ))}
      </ul>
      {result?.data?.hasMore && (
        <button
          type="button"
          className="address-more"
          aria-controls="address-options"
          aria-disabled={result.more === 'loading'}
          onClick={loadMore}
        >
          {result.more === 'error' ? '주소 더 보기 다시 시도' : '주소 더 보기'}
        </button>
      )}
      <div className="address-feedback" role="status">
        {suggestions.length > 0 && (
          <span className="visually-hidden">{suggestions.length}개 주소 후보. </span>
        )}
        {status}
        {result && !result.data && (
          <button
            type="button"
            className="address-secondary"
            onClick={() => {
              setReply(null);
              setAttempt((n) => n + 1);
              input.current?.focus();
            }}
          >
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
