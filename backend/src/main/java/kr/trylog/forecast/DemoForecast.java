package kr.trylog.forecast;

import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.NavigableMap;
import java.util.TreeMap;

/** A reproducible seven-day sales outlook for the supplied single-store demo. */
public record DemoForecast(String storeName, boolean demo, String source, LocalDate dataThrough,
                           String model, String rangeMethod, Validation validation,
                           Historical historical, List<Day> days, Candidate candidate) {
    public record Validation(LocalDate startDate, LocalDate endDate, int days,
                             long mae, double wape, long baselineMae, double baselineWape) { }
    public record Day(LocalDate date, long expected, long lower, long upper) { }
    public record Historical(LocalDate startDate, LocalDate endDate, long actual, long expected,
                             long difference) { }
    public record Candidate(String model, long mae, double wape, long errorRadius, List<CandidateDay> days) { }
    public record CandidateDay(LocalDate date, long expected) { }

    private static final int LOOKBACK_WEEKS = 4;
    private static final int VALIDATION_DAYS = 28;
    private static final int HORIZON_DAYS = 7;

    static DemoForecast fromSample() {
        NavigableMap<LocalDate, Long> sales = readSales();
        LocalDate last = sales.lastKey();
        LocalDate firstValidation = last.minusDays(VALIDATION_DAYS - 1);
        long totalSales = 0;
        long modelError = 0;
        long baselineError = 0;
        List<Long> errors = new ArrayList<>();

        // Evaluate four successive seven-day forecasts. The most recent feature for
        // any day is exactly seven days older, so a week's own observations are unavailable.
        for (LocalDate date = firstValidation; !date.isAfter(last); date = date.plusDays(1)) {
            long actual = sales.get(date);
            long error = Math.abs(actual - estimate(sales, date));
            errors.add(error);
            modelError += error;
            baselineError += Math.abs(actual - sales.get(date.minusWeeks(1)));
            totalSales += actual;
        }

        Validation validation = new Validation(firstValidation, last, VALIDATION_DAYS,
                Math.round((double) modelError / VALIDATION_DAYS), wape(modelError, totalSales),
                Math.round((double) baselineError / VALIDATION_DAYS), wape(baselineError, totalSales));
        Collections.sort(errors);
        long radius = errors.get((int) Math.ceil(errors.size() * 0.8) - 1);
        List<Day> days = new ArrayList<>();
        for (int lead = 1; lead <= HORIZON_DAYS; lead++) {
            LocalDate date = last.plusDays(lead);
            long predicted = estimate(sales, date);
            days.add(new Day(date, predicted, Math.max(0, predicted - radius), predicted + radius));
        }
        return new DemoForecast("지니네김밥", true,
                "제공된 시연용 POS 자료 · 가게 1 · 환불 제외 일매출",
                last, "최근 4주 같은 요일 매출 평균",
                "검증 28일의 절대오차 80번째 백분위만큼 예상 매출의 위아래로 잡은 참고 범위입니다.",
                validation, comparePeriod(sales, LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 20)),
                List.copyOf(days), readCandidate());
    }

    private static Candidate readCandidate() {
        // The demo serves the independently reproducible offline training result.
        try (InputStream input = DemoForecast.class.getResourceAsStream("/forecast/store1-lightgbm.json")) {
            if (input == null) {
                throw new IllegalStateException("시연용 모델 평가 파일이 없습니다.");
            }
            return JsonMapper.builder().addModule(new JavaTimeModule()).build()
                    .readValue(input, Candidate.class);
        } catch (IOException ex) {
            throw new IllegalStateException("시연용 모델 평가 파일을 읽지 못했습니다.", ex);
        }
    }

    static Historical comparePeriod(NavigableMap<LocalDate, Long> sales, LocalDate start, LocalDate end) {
        NavigableMap<LocalDate, Long> knownBeforeStart = sales.headMap(start, false);
        long actual = 0;
        long expected = 0;
        for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
            LocalDate firstWeekDay = start.with(TemporalAdjusters.nextOrSame(day.getDayOfWeek()));
            expected += estimate(knownBeforeStart, firstWeekDay);
            actual += sales.get(day);
        }
        return new Historical(start, end, actual, expected, actual - expected);
    }

    private static double wape(long absoluteError, long actualSales) {
        if (actualSales <= 0) {
            throw new IllegalStateException("검증 기간의 매출 합계는 양수여야 합니다.");
        }
        return Math.round(10_000.0 * absoluteError / actualSales) / 100.0;
    }

    private static long estimate(NavigableMap<LocalDate, Long> sales, LocalDate target) {
        long sum = 0;
        for (int week = 1; week <= LOOKBACK_WEEKS; week++) {
            sum += sales.get(target.minusWeeks(week));
        }
        return Math.round((double) sum / LOOKBACK_WEEKS);
    }

    private static NavigableMap<LocalDate, Long> readSales() {
        // 4_pos_orders.csv: group store_id=1, non-refunded lines by base_date,
        // then sum the transaction price times quantity. Dates without evidence are not zeros.
        String resource = "/forecast/store1-daily-sales.csv";
        InputStream input = DemoForecast.class.getResourceAsStream(resource);
        if (input == null) {
            throw new IllegalStateException("시연용 일매출 파일이 없습니다.");
        }
        NavigableMap<LocalDate, Long> sales = new TreeMap<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            if (!"base_date,daily_sales".equals(reader.readLine())) {
                throw new IllegalStateException("시연용 일매출 파일 헤더가 잘못됐습니다.");
            }
            String line;
            while ((line = reader.readLine()) != null) {
                String[] fields = line.split(",", -1);
                LocalDate date = LocalDate.parse(fields[0]);
                long amount = Long.parseLong(fields[1]);
                if ((!sales.isEmpty() && !date.equals(sales.lastKey().plusDays(1))) || amount < 0) {
                    throw new IllegalStateException("시연용 일매출 날짜와 금액을 확인해 주세요.");
                }
                sales.put(date, amount);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("시연용 일매출 파일을 읽지 못했습니다.", ex);
        }
        if (sales.size() < VALIDATION_DAYS + LOOKBACK_WEEKS * 7) {
            throw new IllegalStateException("시계열 검증에 필요한 일매출이 부족합니다.");
        }
        return sales;
    }
}
