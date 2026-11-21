import type { Experiment } from '../types';
import { ExperimentList } from '../components/ExperimentList';
import { PageHeading } from '../components/PageHeading';
import { Icon } from '../components/Icon';

export function RecordsPage({ experiments }: { experiments: Experiment[] }) {
  return (
    <>
      <PageHeading title="내 기록">내가 해본 일을 차곡차곡 모아봐요.</PageHeading>
      <div className="view-tabs">
        <a href="#/records" aria-current="page">
          내 가게
        </a>
        <a href="#/calendar">달력으로 보기</a>
        <a href="#/chats">대화 내역</a>
      </div>
      <div className="summary-tiles">
        <div>
          <strong>{experiments.length}</strong>
          <span>남긴 시도</span>
        </div>
        <div>
          <strong>{experiments.filter((item) => item.status === 'IN_PROGRESS').length}</strong>
          <span>진행 중</span>
        </div>
        <div>
          <strong>{experiments.filter((item) => item.status === 'READY').length}</strong>
          <span>확인할 차례</span>
        </div>
      </div>
      {experiments.length ? (
        <>
          <div className="section-title">
            <h2>내가 해본 일</h2>
            <a href="#/new">
              <Icon name="plus" size={16} /> 시도 남기기
            </a>
          </div>
          <ExperimentList experiments={experiments} />
        </>
      ) : (
        <section className="empty-state">
          <div className="empty-icon">
            <Icon name="note" size={30} />
          </div>
          <h2>아직 남긴 시도가 없어요</h2>
          <p>
            메뉴판이나 가격처럼
            <br />
            가게에서 바꾼 일을 남겨보세요.
          </p>
          <a className="button" href="#/new">
            첫 시도 남기기
          </a>
        </section>
      )}
      <a className="sample-link" href="#/sample">
        <span className="tag">가상 자료</span>
        <span>
          <strong>결과는 어떻게 보일까요?</strong>
          <small>주문 수와 비중을 함께 보는 예시</small>
        </span>
        <Icon name="arrow" size={18} />
      </a>
    </>
  );
}
