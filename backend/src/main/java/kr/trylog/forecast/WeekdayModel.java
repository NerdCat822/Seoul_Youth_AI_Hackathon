package kr.trylog.forecast;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.NavigableMap;
import java.util.TreeSet;

final class WeekdayModel {
    static final String NAME = "최근 4주 같은 요일 매출 평균";
    record Evaluation(SalesForecast.Validation metrics, long radius) {}

    static List<LocalDate> missingDates(NavigableMap<LocalDate, Long> history, LocalDate through) {
        var missing = new TreeSet<LocalDate>();
        for (int lead = 1; lead <= 7; lead++) {
            for (int lag = 1; lag <= 4; lag++) {
                LocalDate date = through.plusDays(lead).minusWeeks(lag);
                if (!history.containsKey(date)) missing.add(date);
            }
        }
        return List.copyOf(missing);
    }

    static List<SalesForecast.Day> predict(NavigableMap<LocalDate, Long> history, LocalDate through, Long radius) {
        var days = new ArrayList<SalesForecast.Day>();
        for (int lead = 1; lead <= 7; lead++) {
            LocalDate date = through.plusDays(lead);
            long expected = estimate(history, date);
            days.add(new SalesForecast.Day(date, expected, radius == null ? null : Math.max(0, expected - radius),
                    radius == null ? null : expected + radius));
        }
        return List.copyOf(days);
    }

    static Evaluation validate(NavigableMap<LocalDate, Long> history, LocalDate through) {
        LocalDate start = through.minusDays(27);
        var errors = new ArrayList<Long>();
        long sales = 0, modelError = 0, baselineError = 0;
        for (LocalDate date = start; !date.isAfter(through); date = date.plusDays(1)) {
            Long actual = history.get(date), expected = estimate(history, date);
            if (actual == null || expected == null) return null;
            long error = Math.abs(actual - expected);
            errors.add(error);
            modelError += error;
            baselineError += Math.abs(actual - history.get(date.minusWeeks(1)));
            sales += actual;
        }
        var metrics = new SalesForecast.Validation(start, through, errors.size(),
                Math.round(modelError / (double) errors.size()), wape(modelError, sales),
                Math.round(baselineError / (double) errors.size()), wape(baselineError, sales));
        Collections.sort(errors);
        return new Evaluation(metrics, errors.get((int) Math.ceil(errors.size() * 0.8) - 1));
    }

    static SalesForecast.Historical historical(NavigableMap<LocalDate, Long> history, LocalDate start, LocalDate end) {
        long length = ChronoUnit.DAYS.between(start, end) + 1;
        if (length < 1 || length > history.size()) return null;
        long actual = 0, expected = 0;
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            // Keep every week anchored to information available before the experiment.
            LocalDate firstWeek = start.with(TemporalAdjusters.nextOrSame(date.getDayOfWeek()));
            Long estimate = estimate(history, firstWeek), observed = history.get(date);
            if (estimate == null || observed == null) return null;
            expected += estimate;
            actual += observed;
        }
        return new SalesForecast.Historical(start, end, actual, expected, actual - expected);
    }

    private static Long estimate(NavigableMap<LocalDate, Long> history, LocalDate target) {
        long sum = 0;
        for (int lag = 1; lag <= 4; lag++) {
            Long observed = history.get(target.minusWeeks(lag));
            if (observed == null) return null;
            sum += observed;
        }
        return Math.round(sum / 4.0);
    }

    private static Double wape(long error, long actual) {
        return actual == 0 ? null : Math.round(10_000.0 * error / actual) / 100.0;
    }
}
