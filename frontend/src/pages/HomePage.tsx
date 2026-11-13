import type { AppData } from '../types';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { ExperimentList } from '../components/ExperimentList';
import { formatDate } from '../lib/dates';

export function HomePage({ data }: { data: AppData }) {
  const ready = data.experiments.filter((item) => item.status === 'READY');
  return (
    <>
      <section className="welcome">
        <span className="welcome-label">사장님의 작은 장사 비서</span>
        <div
          className="welcome-art"
          aria-label="떡순튀 세트에 사장님 추천 표시가 붙은 메뉴판"
          role="img"
        >
          <div className="menu-paper">
            <span className="menu-caption">우리 가게 메뉴판</span>
            <div className="menu-feature">
              <Illustration />
              <div>
                <strong>떡순튀 세트</strong>
                <span>떡볶이 · 순대 · 모둠튀김</span>
              </div>
            </div>
            <span className="menu-sticker">★ 사장님 추천</span>
            <div className="menu-lines">
              <i />
              <i />
            </div>
          </div>
          <span className="spark spark-one">✦</span>
          <span className="spark spark-two">✧</span>
        </div>
        <h1>
          돈 안 들이고,
          <br />
          오늘 뭐 하나 바꿔볼까요?
        </h1>
        <p>내가 바꾼 장사, 얼마나 달라졌을까?</p>
        <a href="#/cases?free=true" className="button welcome-button">
          0원으로 해볼 일 보기 <Icon name="arrow" size={18} />
        </a>
      </section>
      <a className="record-entry" href="#/new">
        <span className="entry-icon">
          <Icon name="plus" />
        </span>
        <span>
          <strong>이미 바꾼 일이 있어요</strong>
          <small>작은 시도 하나를 기록해보세요</small>
        </span>
        <Icon name="arrow" size={18} />
      </a>
      {ready.length > 0 && (
        <aside className="ready-callout">
          <Icon name="calendar" />
          <div>
            <strong>확인할 차례인 시도가 {ready.length}개 있어요</strong>
            <p>남긴 기록을 다시 살펴보세요.</p>
          </div>
          <a href="#/records">보기</a>
        </aside>
      )}
      <section className="home-section">
        <div className="section-title">
          <h2>내가 남긴 시도</h2>
          <a href="#/records">
            모두 보기 <Icon name="arrow" size={14} />
          </a>
        </div>
        {data.experiments.length ? (
          <ExperimentList experiments={data.experiments.slice(0, 2)} />
        ) : (
          <div className="empty-inline">
            <div className="empty-icon">
              <Icon name="note" size={25} />
            </div>
            <p>
              아직 남긴 시도가 없어요.
              <br />
              <strong>오늘의 작은 변화부터 시작해보세요.</strong>
            </p>
          </div>
        )}
      </section>
      <a href="#/cases" className="discovery">
        <Illustration kind="MARKETING" />
        <span>
          <strong>동네 가게들은 뭘 해봤을까?</strong>
          <small>가상 사례로 다음 시도 찾아보기</small>
        </span>
        <Icon name="arrow" size={18} />
      </a>
      <p className="today-note">
        {formatDate(data.overview.today, true)} · 오늘도 사장님을 응원해요.
      </p>
    </>
  );
}
