package kr.trylog;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class TrylogApplication {
    public static void main(String[] args) {
        SpringApplication.run(TrylogApplication.class, args);
    }

    @Bean
    Clock applicationClock(@Value("${trylog.demo-date:}") String demoDate) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        if (demoDate.isBlank()) {
            return Clock.system(seoul);
        }
        return Clock.fixed(LocalDate.parse(demoDate).atStartOfDay(seoul).toInstant(), seoul);
    }
}
