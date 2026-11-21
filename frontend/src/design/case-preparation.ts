import sampleBoard from '../../design-final/assets/img/menu-board.png';
import type { Menu, NeighborhoodCase } from '../types';
import { thumbnailByCaseId } from './case-thumbnails';

export interface CasePhoto {
  image: File | string;
  menuCode?: string;
}

export function prepareCase(
  idea: NeighborhoodCase,
  menus: Menu[],
  previous: CasePhoto | undefined,
  onSelection: (photo: CasePhoto, text?: string) => void,
  signal: AbortSignal,
) {
  const { icon, esc } = window.App;
  const root = document.createElement('section');
  root.className = 'rounded-card border border-line-light bg-white p-5';
  root.dataset.casePreparation = '';
  const label = { MENU: '메뉴판', OPERATION: '가게 입구', MARKETING: '배달 앱 화면' }[
    idea.category
  ];
  const sample = idea.category === 'MENU' ? sampleBoard : thumbnailByCaseId.get(idea.id);
  root.innerHTML = `<h3 class="text-base font-semibold">${esc(idea.title)}</h3>
    <p class="mt-2 text-sm text-sub">${label} 사진을 이 화면에서 미리 볼 수 있어요.</p>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <label class="btn btn-md btn-primary cursor-pointer">${icon('camera', 18)} 사진 선택
      <input type="file" accept="image/*" aria-label="${label} 사진 선택" class="sr-only"></label>
      ${sample ? '<button type="button" class="hint-chip" data-sample>예시 사진으로 해보기</button>' : ''}</div>
    <div data-preview></div>`;
  let localUrl: string | undefined;
  const release = () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = undefined;
  };
  signal.addEventListener('abort', release, { once: true });
  function preview(photo: CasePhoto) {
    release();
    const area = root.querySelector<HTMLElement>('[data-preview]')!;
    const img = document.createElement('img');
    img.className = 'mt-4 w-[188px] rounded-2xl border border-line-light object-cover';
    img.alt = label + ' 미리보기';
    img.src =
      typeof photo.image === 'string' ? photo.image : (localUrl = URL.createObjectURL(photo.image));
    area.replaceChildren(img);
    if (idea.category !== 'MENU' || !menus.length) return;
    const form = document.createElement('form');
    form.className = 'mt-4';
    form.innerHTML = `<fieldset><legend class="label">가게에 등록된 대표 메뉴 고르기</legend>
      ${menus
        .map(
          (m) => `<label class="flex cursor-pointer items-center gap-3 py-1.5 text-[15px]">
      <input type="radio" name="menu" value="${esc(m.menuCode)}" ${photo.menuCode === m.menuCode ? 'checked' : ''}> ${esc(m.menuName)}</label>`,
        )
        .join('')}</fieldset>
      <button class="btn btn-md btn-primary mt-4" ${photo.menuCode ? '' : 'disabled'}>선택 완료</button>`;
    area.append(form);
    const done = form.querySelector('button')!;
    form.onchange = () => {
      done.disabled = false;
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const selected = menus.find((m) => m.menuCode === new FormData(form).get('menu'));
      if (selected)
        onSelection(
          { image: photo.image, menuCode: selected.menuCode },
          `${selected.menuName} 메뉴로 ‘${idea.title}’ 해볼게요.`,
        );
    };
  }
  function choose(image: File | string) {
    const photo = { image };
    onSelection(photo, idea.title + ' 해볼게요.');
    preview(photo);
  }
  root.querySelector('input')!.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file?.type.startsWith('image/')) choose(file);
    else if (file) window.App.toast('이미지 파일을 선택해 주세요.');
  };
  if (sample) root.querySelector('button')!.onclick = () => choose(sample);
  if (previous) preview(previous);
  return root;
}
