import { PageHeading } from '../components/PageHeading';

export function SamplePage() {
  const before = { sets: 42, orders: 100 };
  const after = { sets: 58, orders: 160 };
  const beforeShare = (before.sets / before.orders) * 100;
  const afterShare = (after.sets / after.orders) * 100;
  return (
    <>
      <PageHeading eyebrow="가상 판매 자료 · 결과 예시" title="주문은 늘었지만, 비중은 줄었어요">
        점심 세트에 추천 표시를 붙인 가상의 2주를 살펴볼까요?
      </PageHeading>
      <div className="demo-banner">이 결과는 내가 저장한 시도와 무관한 예시예요.</div>
      <section className="sample-metrics">
        <div>
          <span>점심 세트가 들어간 주문</span>
          <strong>
            {before.sets}건 <i>→</i> {after.sets}건
          </strong>
          <p>{after.sets - before.sets}건 늘었어요.</p>
        </div>
        <div>
          <span>전체 주문</span>
          <strong>
            {before.orders}건 <i>→</i> {after.orders}건
          </strong>
          <p>전체 주문도 함께 늘었어요.</p>
        </div>
        <div className="highlight">
          <span>전체 주문 중 세트를 고른 비중</span>
          <strong>
            {beforeShare}% <i>→</i> {afterShare}%
          </strong>
          <p>{(beforeShare - afterShare).toFixed(2)}%p 줄었어요.</p>
        </div>
      </section>
      <p className="result-explainer">
        주문 수만 보면 놓치는 변화가 있어요. <strong>전체 주문 중 얼마나 선택됐는지</strong>도 같이
        봐야 해요.
      </p>
      <section className="card">
        <h2>이렇게 비교했어요</h2>
        <p>
          변경 전 14일과 변경 후 14일의 가상 주문을 비교했어요. 비중은 세트 주문 수를 전체 주문 수로
          나눈 값이에요.
        </p>
        <p className="small-note">
          이 숫자만으로 추천 표시가 얼마나 영향을 줬는지는 알기 어려워요.
        </p>
      </section>
      <a className="button" href="#/new">
        우리 가게 시도 남기기
      </a>
    </>
  );
}
