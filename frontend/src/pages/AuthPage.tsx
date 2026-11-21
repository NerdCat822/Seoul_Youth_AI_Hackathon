import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { ApiError, logIn, signUp } from '../api';
import { AddressSearch } from '../components/AddressSearch';
import { useQuery } from '../lib/useQuery';
import type { AuthSession, StoreAddress, Upjong } from '../types';
import './auth.css';

function RequiredMark() {
  return (
    <b className="required-mark" aria-hidden="true">
      *
    </b>
  );
}

function UpjongField({ error }: { error?: string }) {
  const catalog = useQuery<{ upjongs: Upjong[] }>('/upjongs');
  const options = catalog.data?.upjongs;
  return (
    <div
      className="form-field"
      role="radiogroup"
      aria-labelledby="upjong-label"
      aria-required="true"
      aria-invalid={!!error}
      aria-describedby={error ? 'upjong-error' : undefined}
      tabIndex={-1}
    >
      <span className="auth-field-label" id="upjong-label">
        업종
        <RequiredMark />
      </span>
      {options?.length ? (
        <div className="upjong-options">
          {options.map(({ upjongCd, upjongNm }) => (
            <label key={upjongCd}>
              <input type="radio" name="upjong" value={upjongCd} required />
              {upjongNm}
            </label>
          ))}
        </div>
      ) : catalog.error || options ? (
        <div className="upjong-status">
          <p role="status">
            {catalog.error
              ? '업종 목록을 불러오지 못했어요.'
              : '현재 선택할 수 있는 업종이 없어요.'}
          </p>
          <button type="button" className="button compact secondary" onClick={catalog.retry}>
            다시 불러오기
          </button>
        </div>
      ) : (
        <p className="upjong-status" role="status">
          업종을 불러오고 있어요…
        </p>
      )}
      {error && (
        <span className="field-error" id="upjong-error">
          {error}
        </span>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  error,
  markRequired,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
  markRequired?: boolean;
}) {
  return (
    <div className="form-field">
      <label htmlFor={'auth-' + name}>
        {label}
        {markRequired && <RequiredMark />}
      </label>
      <input
        {...input}
        name={name}
        id={'auth-' + name}
        aria-invalid={!!error}
        aria-describedby={error ? name + '-error' : undefined}
      />
      {error && (
        <span className="field-error" id={name + '-error'}>
          {error}
        </span>
      )}
    </div>
  );
}

export function AuthPage({
  signup,
  signupEnabled,
  onAuthenticated,
}: {
  signup: boolean;
  signupEnabled: boolean;
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [address, setAddress] = useState<StoreAddress | null>(null);
  const [focusAddressSearch, setFocusAddressSearch] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const onSelected = useCallback((selected: StoreAddress) => {
    setAddress(selected);
    setMessage('');
    setErrors((current) => ({
      ...current,
      postalCode: '',
      address: '',
      addressDetail: '',
      megaCd: '',
      megaNm: '',
      ctyCd: '',
      ctyNm: '',
    }));
  }, []);
  useEffect(() => {
    const detail = formRef.current?.elements.namedItem('addressDetail') as HTMLInputElement | null;
    if (!detail) return;
    detail.value = '';
    if (address) detail.focus();
  }, [address]);
  const addressError =
    errors.address ||
    errors.postalCode ||
    errors.megaCd ||
    errors.megaNm ||
    errors.ctyCd ||
    errors.ctyNm;

  function displayErrors(issues: Record<string, string>) {
    setErrors(issues);
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || (signup && !signupEnabled)) return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) || '').trim();
    const loginId = value('loginId');
    const password = String(fields.get('password') || '');
    const issues: Record<string, string> = {};
    if (!loginId) issues.loginId = '로그인 아이디를 입력해주세요.';
    if (!password) issues.password = '비밀번호를 입력해주세요.';
    if (signup) {
      if (!/^[a-zA-Z0-9._-]{4,40}$/.test(loginId))
        issues.loginId = '영문, 숫자, 마침표, 밑줄, 붙임표로 4~40자를 입력해주세요.';
      if (password.length < 8 || password.length > 128)
        issues.password = '비밀번호는 8~128자로 입력해주세요.';
      if (!value('storeName')) issues.storeName = '가게 이름을 입력해주세요.';
      if (!value('upjong')) issues.upjong = '업종을 선택해주세요.';
      if (!address) issues.address = '주소 검색에서 가게 주소를 선택해주세요.';
      if (!value('addressDetail')) issues.addressDetail = '상세 주소를 입력해주세요.';
      if (!value('openedDate')) issues.openedDate = '개업일을 입력해주세요.';
      if (!value('openTime')) issues.openTime = '영업 시작 시간을 입력해주세요.';
      if (!value('closeTime')) issues.closeTime = '영업 종료 시간을 입력해주세요.';
    }
    setMessage('');
    displayErrors(issues);
    if (Object.keys(issues).length) return;
    pending.current = true;
    setBusy(true);
    try {
      const session =
        signup && address
          ? await signUp({
              ...address,
              loginId,
              password,
              storeName: value('storeName'),
              upjong: value('upjong'),
              addressDetail: value('addressDetail'),
              openTime: value('openTime'),
              closeTime: value('closeTime'),
              openedDate: value('openedDate'),
              closedWeekdays: fields.getAll('closedWeekdays').map(Number),
            })
          : await logIn(loginId, password);
      onAuthenticated(session);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '잠시 후 다시 시도해주세요.');
      if (reason instanceof ApiError) displayErrors(reason.fieldErrors);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className={'auth-card ' + (signup ? 'register-card' : '')}>
        <a className="auth-brand" href="#/login" aria-label="트라이로그 로그인">
          <i aria-hidden="true">✓</i>Trylog
        </a>
        <h1>{signup ? '가게 등록' : '우리 가게 로그인'}</h1>
        <p className="auth-lead">
          {signup
            ? '가게 정보와 로그인에 사용할 계정을 입력해주세요.'
            : '가게 계정으로 로그인해 시도와 매출 기록을 확인하세요.'}
        </p>
        {signup && !signupEnabled ? (
          <section className="auth-disabled">
            <p>현재 서버는 읽기 전용으로 운영되어 가게 등록이 닫혀 있어요.</p>
            <a className="button secondary" href="#/login">
              로그인으로 돌아가기
            </a>
          </section>
        ) : (
          <form
            ref={formRef}
            onSubmit={submit}
            noValidate
            onChange={(event) => {
              const input = event.target;
              if (!(input instanceof HTMLInputElement)) return;
              setMessage('');
              setErrors((current) =>
                current[input.name] ? { ...current, [input.name]: '' } : current,
              );
            }}
          >
            <fieldset className="auth-fields" disabled={busy}>
              {signup && <legend>로그인 정보</legend>}
              <Field
                name="loginId"
                label="로그인 아이디"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={40}
                error={errors.loginId}
              />
              <Field
                name="password"
                label="비밀번호"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                maxLength={128}
                minLength={signup ? 8 : undefined}
                placeholder={signup ? '8자 이상' : undefined}
                error={errors.password}
              />
            </fieldset>
            {signup && (
              <>
                <fieldset className="auth-fields" disabled={busy}>
                  <legend>가게 정보</legend>
                  <Field
                    name="storeName"
                    label="가게 이름"
                    autoComplete="organization"
                    required
                    markRequired
                    maxLength={100}
                    error={errors.storeName}
                  />
                  <UpjongField error={errors.upjong} />
                  <div
                    className="form-field"
                    role="group"
                    aria-labelledby="store-address-label"
                    aria-invalid={!!addressError}
                    aria-describedby={addressError ? 'address-error' : undefined}
                    tabIndex={-1}
                  >
                    <span className="auth-field-label" id="store-address-label">
                      가게 주소
                      <RequiredMark />
                      <span className="visually-hidden"> (필수)</span>
                    </span>
                    {address ? (
                      <div className="selected-address">
                        <p aria-live="polite">
                          <small>우편번호 {address.postalCode}</small>
                          {address.address}
                        </p>
                        <button
                          type="button"
                          className="address-change"
                          onClick={() => {
                            setFocusAddressSearch(true);
                            setAddress(null);
                          }}
                        >
                          주소 다시 검색
                        </button>
                      </div>
                    ) : (
                      <AddressSearch onSelected={onSelected} focusOnOpen={focusAddressSearch} />
                    )}
                    {addressError && (
                      <span className="field-error" id="address-error">
                        {addressError}
                      </span>
                    )}
                  </div>
                  <Field
                    name="addressDetail"
                    label="상세 주소"
                    autoComplete="address-line2"
                    disabled={!address}
                    maxLength={150}
                    required
                    markRequired
                    error={errors.addressDetail}
                  />
                  <Field
                    name="openedDate"
                    label="개업일"
                    type="date"
                    required
                    error={errors.openedDate}
                  />
                  <div className="auth-hours">
                    <Field
                      name="openTime"
                      label="영업 시작 시간"
                      type="time"
                      required
                      error={errors.openTime}
                    />
                    <Field
                      name="closeTime"
                      label="영업 종료 시간"
                      type="time"
                      required
                      error={errors.closeTime}
                    />
                  </div>
                  <fieldset className="weekday-choice">
                    <legend>정기 휴무일 (선택)</legend>
                    {['월', '화', '수', '목', '금', '토', '일'].map((day, index) => (
                      <label key={day}>
                        <input type="checkbox" name="closedWeekdays" value={index} />
                        {day}
                      </label>
                    ))}
                    {errors.closedWeekdays && (
                      <span className="field-error">{errors.closedWeekdays}</span>
                    )}
                  </fieldset>
                </fieldset>
              </>
            )}
            {message && (
              <p role="alert" className="form-error">
                {message}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? '처리하고 있어요…' : signup ? '가입하고 시작하기' : '로그인'}
            </button>
          </form>
        )}
        {(!signup || signupEnabled) && (
          <p className="auth-switch">
            {signup ? '이미 등록한 가게가 있나요?' : '아직 가게 계정이 없나요?'}{' '}
            <a href={signup ? '#/login' : '#/signup'}>{signup ? '로그인' : '회원가입'}</a>
          </p>
        )}
      </div>
    </main>
  );
}
