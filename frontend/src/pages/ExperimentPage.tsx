import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Category, Experiment, ExperimentInput, Menu, NeighborhoodCase } from '../types';
import { ApiError, createExperiment } from '../api';
import { addDays, formatDate } from '../lib/dates';
import { actions, categories, statuses } from '../lib/labels';
import { PageHeading } from '../components/PageHeading';
import { Icon } from '../components/Icon';
import { parseDraft } from '../lib/draft';

export function ExperimentFormPage({
  today,
  menus,
  writeEnabled,
  seed,
  draft,
  previous,
  onCreated,
}: {
  today: string;
  menus: Menu[];
  writeEnabled: boolean;
  seed?: NeighborhoodCase;
  draft?: string;
  previous?: Experiment;
  onCreated: (experiment: Experiment) => void;
}) {
  const [form, setForm] = useState<ExperimentInput>(() => {
    const initial = draft
      ? parseDraft(draft, today)
      : {
          title: seed?.title ?? previous?.title ?? '',
          category: seed?.category ?? previous?.category ?? 'MENU',
          startDate: today,
          endDate: addDays(today, (seed?.durationDays ?? 14) - 1),
          notes: previous ? `지난 시도 ‘${previous.title}’에서 이어가는 기록` : '',
        };
    const caseActions: Record<string, string> = {
      'menu-badge': 'MENU_BADGE',
      'menu-description': 'MENU_COPY_PHOTO',
      'menu-photo': 'MENU_COPY_PHOTO',
      'pickup-sign': 'STORE_SIGNAGE',
      'quiet-hours': 'HOURS_OPERATION',
      'shop-intro': 'LOCAL_PROMO',
    };
    return {
      ...initial,
      actionType: previous?.actionType || caseActions[seed?.id ?? ''] || '',
      targetMenuCode: previous?.targetMenuCode ?? null,
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const lastRequest = useRef<{ body: string; key: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  function update(field: keyof ExperimentInput, value: string | null) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !writeEnabled) return;
    const validation: Record<string, string> = {};
    if (!form.title.trim()) validation.title = '해볼 일을 적어주세요.';
    if (!form.actionType) validation.actionType = '행동 유형을 선택해주세요.';
    if (form.title.trim().length > 80) validation.title = '80자 이내로 적어주세요.';
    if (!form.startDate || form.startDate < '2000-01-01' || form.startDate > '2100-12-31')
      validation.startDate = '2000년부터 2100년 사이의 날짜를 선택해주세요.';
    if (!form.endDate || form.endDate < form.startDate || form.endDate > '2100-12-31')
      validation.endDate = '시작일 이후, 2100년 안의 날짜를 선택해주세요.';
    if (form.notes.length > 500) validation.notes = '메모는 500자 이내로 적어주세요.';
    setErrors(validation);
    if (Object.keys(validation).length) {
      setMessage('입력 내용을 확인해주세요.');
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    submitting.current = true;
    setSaving(true);
    setMessage('');
    try {
      const input = { ...form, title: form.title.trim(), notes: form.notes.trim() };
      const body = JSON.stringify(input);
      if (lastRequest.current?.body !== body)
        lastRequest.current = { body, key: crypto.randomUUID() };
      onCreated(await createExperiment(input, lastRequest.current.key));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해주세요.');
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading title={previous ? '다음 시도 남기기' : '새 기록'}>
        {previous
          ? '지난 시도에서 한 가지만 바꿔보세요. 제목과 기간을 수정한 뒤 저장할 수 있어요.'
          : '가게에서 바꾼 일과 기간을 확인해주세요.'}
      </PageHeading>
      <form className="experiment-form" onSubmit={submit} ref={formRef} noValidate>
        <div className="form-field">
          <label htmlFor="title">
            해볼 일 <span>필수</span>
          </label>
          <input
            id="title"
            name="title"
            autoFocus
            required
            maxLength={80}
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="예: 점심 세트에 추천 표시 붙이기"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
          />
          <FieldError id="title-error" message={errors.title} />
        </div>
        <div className="form-field">
          <label htmlFor="category">어떤 변화인가요?</label>
          <select
            id="category"
            value={form.category}
            onChange={(event) => update('category', event.target.value as Category)}
            aria-invalid={!!errors.category}
            aria-describedby={errors.category ? 'category-error' : undefined}
          >
            {Object.entries(categories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError id="category-error" message={errors.category} />
        </div>
        <div className="form-field">
          <label htmlFor="actionType">
            행동 유형 <span>필수</span>
          </label>
          <select
            id="actionType"
            required
            value={form.actionType}
            onChange={(event) => update('actionType', event.target.value)}
            aria-invalid={!!errors.actionType}
            aria-describedby={errors.actionType ? 'action-error' : undefined}
          >
            <option value="">행동을 선택해주세요</option>
            {form.actionType && !actions[form.actionType] && (
              <option value={form.actionType}>{form.actionType}</option>
            )}
            {Object.entries(actions).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <FieldError id="action-error" message={errors.actionType} />
        </div>
        <div className="form-field">
          <label htmlFor="experiment-menu">
            대상 메뉴 <span>선택</span>
          </label>
          <select
            id="experiment-menu"
            value={form.targetMenuCode || ''}
            onChange={(event) => update('targetMenuCode', event.target.value || null)}
            aria-invalid={!!errors.targetMenuCode}
            aria-describedby={errors.targetMenuCode ? 'target-error' : undefined}
          >
            <option value="">비교할 때 선택</option>
            {menus.map((item) => (
              <option key={item.menuCode} value={item.menuCode}>
                {item.menuName} ({item.menuCode})
              </option>
            ))}
          </select>
          <FieldError id="target-error" message={errors.targetMenuCode} />
        </div>
        <fieldset className="date-fields">
          <legend>진행 기간</legend>
          <div className="form-field">
            <label htmlFor="startDate">시작하는 날</label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              min="2000-01-01"
              max="2100-12-31"
              value={form.startDate}
              onChange={(event) => update('startDate', event.target.value)}
              aria-invalid={!!errors.startDate}
              aria-describedby={errors.startDate ? 'startDate-error' : undefined}
            />
            <FieldError id="startDate-error" message={errors.startDate} />
          </div>
          <div className="form-field">
            <label htmlFor="endDate">마지막 날</label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              min={form.startDate || '2000-01-01'}
              max="2100-12-31"
              value={form.endDate}
              onChange={(event) => update('endDate', event.target.value)}
              aria-invalid={!!errors.endDate}
              aria-describedby={errors.endDate ? 'endDate-error' : undefined}
            />
            <FieldError id="endDate-error" message={errors.endDate} />
          </div>
        </fieldset>
        <button
          className="text-action period-preset"
          type="button"
          onClick={() => {
            setForm((current) => ({
              ...current,
              startDate: addDays(today, -14),
              endDate: addDays(today, -1),
            }));
            setErrors((current) => ({ ...current, startDate: '', endDate: '' }));
          }}
        >
          어제로 끝난 최근 14일로 설정
        </button>
        {form.endDate && form.endDate >= form.startDate && form.endDate <= '2100-12-31' && (
          <p className="check-hint">
            <Icon name="calendar" size={18} />
            <span>
              <strong>{formatDate(addDays(form.endDate, 1), true)}</strong>에 다시 살펴봐요.
            </span>
          </p>
        )}
        <div className="form-field">
          <label htmlFor="notes">
            더 남길 말 <span>선택</span>
          </label>
          <textarea
            id="notes"
            rows={4}
            maxLength={500}
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
            placeholder="어디를, 어떻게 바꿨는지 짧게 적어주세요."
            aria-invalid={!!errors.notes}
            aria-describedby={errors.notes ? 'notes-error' : undefined}
          />
          <FieldError id="notes-error" message={errors.notes} />
          <span className="char-count">{form.notes.length} / 500</span>
        </div>
        {message && (
          <div className="form-error" role="alert">
            {message}
          </div>
        )}
        {!writeEnabled && (
          <p className="check-hint">
            현재 가게는 읽기 전용으로 연결되어 있어요. 기존 기록과 주문 비교를 이용할 수 있어요.
          </p>
        )}
        <button className="button" disabled={saving || !writeEnabled} type="submit">
          {saving ? '저장하고 있어요…' : '이대로 저장'}
          {!saving && <Icon name="check" size={19} />}
        </button>
      </form>
    </>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id}>
      {message}
    </p>
  ) : null;
}

export function ExperimentDetailPage({
  experiment,
  menus,
}: {
  experiment: Experiment;
  menus: Menu[];
}) {
  const menu = menus.find((item) => item.menuCode === experiment.targetMenuCode);
  return (
    <>
      <span className={`status status-${experiment.status.toLowerCase()}`}>
        {statuses[experiment.status]}
      </span>
      <PageHeading title={experiment.title}>
        한 가지씩 바꾸며 우리 가게에 맞는 방법을 찾아봐요.
      </PageHeading>
      <section className="card">
        <h2>이렇게 남겨뒀어요</h2>
        <dl className="metadata">
          <div>
            <dt>종류</dt>
            <dd>{categories[experiment.category] ?? experiment.category}</dd>
          </div>
          <div>
            <dt>행동 유형</dt>
            <dd>{actions[experiment.actionType] ?? experiment.actionType}</dd>
          </div>
          <div>
            <dt>대상 메뉴</dt>
            <dd>
              {menu
                ? `${menu.menuName} (${menu.menuCode})`
                : (experiment.targetMenuCode ?? '비교할 때 선택')}
            </dd>
          </div>
          <div>
            <dt>진행 기간</dt>
            <dd>
              {formatDate(experiment.startDate)} ~ {formatDate(experiment.endDate)}
            </dd>
          </div>
          <div>
            <dt>확인할 날</dt>
            <dd>{formatDate(experiment.checkDate, true)}</dd>
          </div>
        </dl>
      </section>
      {experiment.notes && (
        <section className="card">
          <h2>남긴 메모</h2>
          <p className="preserve-lines">{experiment.notes}</p>
        </section>
      )}
      <section className="tip-card">
        <Icon name="calendar" />
        <h2>
          {experiment.status === 'COMPLETED'
            ? '결과를 저장했어요'
            : experiment.status === 'READY'
              ? '이제 시도를 돌아볼 차례예요'
              : '확인할 날을 달력에 표시했어요'}
        </h2>
        <p>
          {experiment.status === 'COMPLETED'
            ? '판매 자료에서 확인한 전후 주문 수와 비중을 다시 볼 수 있어요.'
            : experiment.status === 'READY'
              ? '가게에 저장된 주문으로 메뉴를 선택한 비중과 매출 변화를 확인해보세요.'
              : `${formatDate(experiment.checkDate)}부터 가게의 전후 주문을 비교할 수 있어요.`}
        </p>
      </section>
      {experiment.status === 'READY' && (
        <a className="button" href={`#/experiments/${experiment.id}/upload`}>
          전후 주문 비교하기
        </a>
      )}
      {experiment.status === 'COMPLETED' && (
        <a className="button" href={`#/experiments/${experiment.id}/report`}>
          저장된 결과 보기
        </a>
      )}
      <a className="button secondary spaced" href="#/calendar">
        달력에서 일정 보기
      </a>
      <a className="button secondary spaced" href="#/records">
        내 기록으로 돌아가기
      </a>
    </>
  );
}
