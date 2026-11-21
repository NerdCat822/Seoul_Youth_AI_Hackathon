import type { StoreAddress } from '../types';

interface PostcodeResult {
  zonecode: string;
  userSelectedType: 'R' | 'J';
  roadAddress: string;
  jibunAddress: string;
  sido: string;
  sigungu: string;
  sigunguCode: string;
}

interface PostcodeOptions {
  oncomplete: (result: PostcodeResult) => void;
  width: string;
  height: string;
  minWidth: number;
  shorthand: boolean;
}

type Postcode = new (options: PostcodeOptions) => {
  embed: (container: HTMLElement, options: { autoClose: boolean }) => void;
};

declare global {
  interface Window {
    kakao?: { Postcode?: Postcode };
  }
}

let loading: Promise<Postcode> | null = null;

export function loadPostcode(): Promise<Postcode> {
  if (window.kakao?.Postcode) return Promise.resolve(window.kakao.Postcode);
  if (loading) return loading;
  loading = new Promise<Postcode>((resolve, reject) => {
    const script = document.createElement('script');
    const failure = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          '카카오 주소 검색에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.',
        ),
      );
    };
    const timer = window.setTimeout(failure, 10000);
    script.src = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    script.onerror = failure;
    script.onload = () => {
      if (!window.kakao?.Postcode) {
        failure();
        return;
      }
      window.clearTimeout(timer);
      resolve(window.kakao.Postcode);
    };
    document.head.appendChild(script);
  }).catch((reason) => {
    loading = null;
    throw reason;
  });
  return loading;
}

export function fromPostcode(result: PostcodeResult): StoreAddress {
  const address = result.userSelectedType === 'R' ? result.roadAddress : result.jibunAddress;
  // Sejong has no separate district name in Kakao's returned address.
  const district = result.sigungu || (result.sigunguCode === '36110' ? result.sido : '');
  if (
    !['R', 'J'].includes(result.userSelectedType) ||
    !/^\d{5}$/.test(result.zonecode) ||
    !/^\d{5}$/.test(result.sigunguCode) ||
    !result.sido ||
    !district ||
    !address
  )
    throw new Error(
      '선택한 주소의 행정구역이나 우편번호를 확인할 수 없어요. 주소를 다시 선택해주세요.',
    );
  return {
    postalCode: result.zonecode,
    address,
    megaNm: result.sido,
    megaCd: result.sigunguCode.slice(0, 2),
    ctyCd: result.sigunguCode,
    ctyNm: district,
  };
}
