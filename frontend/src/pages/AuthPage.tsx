import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { ApiError, logIn, signUp } from '../api';
import { AddressSearch } from '../components/AddressSearch';
import type { AuthSession, StoreAddress } from '../types';
import './auth.css';

function Field({
  name,
  label,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={'auth-' + name}>{label}</label>
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
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const addressTrigger = useRef<HTMLButtonElement>(null);
  const onSelected = useCallback((selected: StoreAddress) => {
    setAddress(selected);
    setSearching(false);
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
    if (!address) return;
    const detail = formRef.current?.elements.namedItem('addressDetail') as HTMLInputElement | null;
    if (!detail) return;
    detail.value = '';
    detail.focus();
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
      if (!value('upjong')) issues.upjong = '업종을 입력해주세요.';
      if (!address) issues.address = '주소 검색에서 가게 주소를 선택해주세요.';
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
                    maxLength={100}
                    error={errors.storeName}
                  />
                  <Field
                    name="upjong"
                    label="업종"
                    placeholder="예: 분식"
                    maxLength={50}
                    required
                    error={errors.upjong}
                  />
                  <div className="form-field" role="group" aria-labelledby="store-address-label">
                    <span className="auth-field-label" id="store-address-label">
                      가게 주소
                    </span>
                    <button
                      id="address-search"
                      ref={addressTrigger}
                      type="button"
                      className="button secondary"
                      aria-haspopup="dialog"
                      aria-invalid={!!addressError}
                      aria-describedby={addressError ? 'address-error' : undefined}
                      onClick={() => setSearching(true)}
                    >
                      {address ? '주소 다시 검색' : '주소 검색'}
                    </button>
                    {address && (
                      <p className="selected-address" aria-live="polite">
                        <small>우편번호 {address.postalCode}</small>
                        {address.address}
                      </p>
                    )}
                    {addressError && (
                      <span className="field-error" id="address-error">
                        {addressError}
                      </span>
                    )}
                  </div>
                  <Field
                    name="addressDetail"
                    label="상세 주소 (선택)"
                    autoComplete="address-line2"
                    maxLength={150}
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
      {searching && (
        <AddressSearch
          onSelected={onSelected}
          onClose={() => {
            setSearching(false);
            requestAnimationFrame(() => addressTrigger.current?.focus());
          }}
        />
      )}
    </main>
  );
}
