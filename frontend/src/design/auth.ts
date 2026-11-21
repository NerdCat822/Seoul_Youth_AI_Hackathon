import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, getSession, logIn, request, setSessionToken, signUp } from '../api';
import { AddressSearch } from '../components/AddressSearch';
import type { AuthSession, StoreAddress, Upjong } from '../types';
import { afterLogin } from './navigation';
import './inputs.css';

function formError(form: HTMLFormElement, message: string, field?: HTMLElement | null) {
  const error = form.querySelector<HTMLElement>('[data-error]')!;
  error.setAttribute('role', 'alert');
  error.hidden = !message;
  error.textContent = message;
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}

function notice(error: unknown) {
  return error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
}

function announceLogin(session: AuthSession) {
  setSessionToken(session.csrfToken);
  window.dispatchEvent(new Event('trylog-auth-changed'));
}

function SignupAddress({ choose }: { choose: (value: StoreAddress | null) => void }) {
  const [selected, setSelected] = useState<StoreAddress | null>(null);
  return createElement(AddressSearch, {
    selected,
    onSelected(value) {
      setSelected(value);
      choose(value);
    },
    inputClassName: 'input pl-9',
    placeholder: '주소 입력',
  });
}

function addressPicker() {
  const wrapper = document.querySelector<HTMLInputElement>('#s-addr')!.parentElement!;
  const label = document.querySelector<HTMLLabelElement>('[for="s-addr"]')!;
  label.htmlFor = 'auth-address';
  const detailBlock = document.createElement('div');
  detailBlock.className = 'mt-5';
  detailBlock.hidden = true;
  detailBlock.innerHTML =
    '<label class="label" for="s-detail">상세 주소<span class="req">*</span></label><input id="s-detail" class="input" autocomplete="address-line2" maxlength="150" required>';
  wrapper.parentElement!.after(detailBlock);
  const detail = detailBlock.querySelector('input')!;
  let address: StoreAddress | null = null;
  const root = createRoot(wrapper);
  root.render(
    createElement(SignupAddress, {
      choose(value) {
        address = value;
        detail.value = '';
        detailBlock.hidden = !value;
        if (value) detail.focus();
      },
    }),
  );
  return {
    get selected() {
      return address;
    },
    detail,
  };
}

export async function mountAuth(page: string, session?: AuthSession) {
  const state = session ?? (await getSession());
  setSessionToken(state.csrfToken);
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  if (page === 'login') {
    const form = document.querySelector<HTMLFormElement>('[data-login]')!;
    const title = form.querySelector('h1')!;
    const logo = new Image(92, 28);
    logo.src = 'assets/img/logo.svg';
    logo.alt = 'trylog';
    logo.className = 'h-7 w-[92px]';
    title.classList.add('flex', 'items-center', 'gap-2');
    title.replaceChildren(logo, ' 시작하기');
    const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      const id = field('uid'),
        pw = field('pw');
      id.removeAttribute('aria-invalid');
      pw.removeAttribute('aria-invalid');
      if (!id.value.trim() || !pw.value) {
        formError(form, '아이디와 비밀번호를 입력해 주세요.', !id.value.trim() ? id : pw);
        return;
      }
      button.disabled = true;
      try {
        announceLogin(await logIn(id.value.trim(), pw.value));
        location.assign(afterLogin());
      } catch (error) {
        formError(form, notice(error));
        button.disabled = false;
      }
    });
    return;
  }

  const first = document.querySelector<HTMLFormElement>('form[data-step="1"]')!;
  const second = document.querySelector<HTMLFormElement>('form[data-step="2"]')!;
  const finish = second.querySelector<HTMLButtonElement>('[type=submit]')!;
  const group = second.querySelector<HTMLElement>('[data-chip-group=single]')!;
  group.replaceChildren();
  const picker = addressPicker();
  const unsupported = '현재 가입 API에서 저장을 지원하지 않아요.';
  field('s-menu').disabled = true;
  field('s-menu').title = unsupported;
  second.querySelectorAll<HTMLButtonElement>('[data-chip-group=multi] button').forEach((button) => {
    button.disabled = true;
    button.title = unsupported;
    button.setAttribute('aria-pressed', 'false');
  });
  function step(n: number) {
    document.querySelectorAll<HTMLElement>('[data-step]').forEach((el) => {
      el.hidden = el.dataset.step !== String(n);
    });
    document.querySelectorAll<HTMLElement>('[data-step-dot]').forEach((el) => {
      const k = Number(el.dataset.stepDot);
      el.classList.toggle('is-done', k < n);
      el.classList.toggle('is-current', k === n);
      const dot = el.querySelector<HTMLElement>('.num')!;
      if (k < n) dot.innerHTML = window.App.icon('check', 14);
      else dot.textContent = String(k);
    });
    document.querySelector<HTMLInputElement>('[data-step="' + n + '"] input')?.focus();
  }
  step(1);
  second.querySelector('[data-back]')!.addEventListener('click', () => step(1));
  first.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = field('s-id'),
      pw = field('s-pw');
    id.removeAttribute('aria-invalid');
    pw.removeAttribute('aria-invalid');
    if (!/^[a-zA-Z0-9._-]{4,40}$/.test(id.value.trim())) {
      formError(first, '아이디는 영문, 숫자, 마침표, 밑줄, 붙임표로 4~40자를 입력해 주세요.', id);
    } else if (pw.value.length < 8 || pw.value.length > 128) {
      formError(first, '비밀번호는 8~128자로 입력해 주세요.', pw);
    } else {
      formError(first, '');
      step(2);
    }
  });
  const loadIndustries = async () => {
    group.replaceChildren();
    finish.disabled = true;
    try {
      const { upjongs } = await request<{ upjongs: Upjong[] }>('/upjongs');
      if (!upjongs.length) throw new Error('선택할 수 있는 업종이 없어요.');
      upjongs.forEach((industry, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'chip';
        option.textContent = industry.upjongNm;
        option.dataset.code = industry.upjongCd;
        option.setAttribute('aria-pressed', String(index === 0));
        group.append(option);
      });
      finish.disabled = !state.signupEnabled;
      formError(
        second,
        state.signupEnabled ? '' : '현재 서버는 읽기 전용으로 운영되어 계정 등록이 닫혀 있어요.',
      );
    } catch (error) {
      formError(second, notice(error));
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-sm btn-neutral';
      retry.textContent = '다시 불러오기';
      retry.onclick = loadIndustries;
      group.append(retry);
    }
  };
  void loadIndustries();
  second.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (finish.disabled) return;
    for (const input of second.querySelectorAll('[aria-invalid=true]'))
      input.removeAttribute('aria-invalid');
    const address = picker.selected;
    const store = field('s-name'),
      hours = field('s-hours');
    const upjong = group.querySelector<HTMLElement>('[aria-pressed=true]')?.dataset.code;
    if (!store.value.trim()) return formError(second, '가게 이름을 입력해 주세요.', store);
    if (!address)
      return formError(second, '검색 결과에서 주소를 선택해 주세요.', field('auth-address'));
    if (!picker.detail.value.trim())
      return formError(second, '상세 주소를 입력해 주세요.', picker.detail);
    if (!upjong) return formError(second, '업종을 선택해 주세요.');
    const time = hours.value
      .trim()
      .match(/^([01]?\d|2[0-3]):([0-5]\d)\s*[~–-]\s*([01]?\d|2[0-3]):([0-5]\d)$/);
    if (hours.value.trim() && !time)
      return formError(second, '영업시간을 11:00 ~ 21:00 형식으로 입력해 주세요.', hours);
    const back = second.querySelector<HTMLButtonElement>('[data-back]')!;
    finish.disabled = back.disabled = true;
    try {
      const account = await signUp({
        ...address,
        loginId: field('s-id').value.trim(),
        password: field('s-pw').value,
        storeName: store.value.trim(),
        addressDetail: picker.detail.value.trim(),
        upjong,
        openTime: time ? time[1].padStart(2, '0') + ':' + time[2] : undefined,
        closeTime: time ? time[3].padStart(2, '0') + ':' + time[4] : undefined,
      });
      announceLogin(account);
      field('s-pw').value = '';
      document.querySelector('[data-welcome]')!.textContent =
        account.storeName + ' 사장님, 반가워요';
      step(3);
    } catch (error) {
      const errors = error instanceof ApiError ? error.fieldErrors : {};
      const credentials = errors.loginId || errors.password;
      if (credentials) step(1);
      formError(
        credentials ? first : second,
        credentials || Object.values(errors)[0] || notice(error),
      );
    } finally {
      finish.disabled = back.disabled = false;
    }
  });
}
