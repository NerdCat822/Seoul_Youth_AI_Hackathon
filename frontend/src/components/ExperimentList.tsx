import type { Experiment } from '../types';
import { formatDate } from '../lib/dates';
import { statuses } from '../lib/labels';
import { Icon } from './Icon';

export function ExperimentList({ experiments }: { experiments: Experiment[] }) {
  return (
    <div className="experiment-list">
      {experiments.map((experiment) => (
        <a
          className="experiment-card"
          key={experiment.id}
          href={`#/experiments/${encodeURIComponent(experiment.id)}`}
        >
          <div className="record-icon">
            <Icon name="note" />
          </div>
          <div className="card-copy">
            <span className={`status status-${experiment.status.toLowerCase()}`}>
              {statuses[experiment.status]}
            </span>
            <h3>{experiment.title}</h3>
            <p>
              {experiment.status === 'COMPLETED'
                ? '저장한 결과 보기'
                : `${formatDate(experiment.checkDate)} 결과 확인일`}
            </p>
          </div>
          <Icon name="arrow" size={17} />
        </a>
      ))}
    </div>
  );
}
