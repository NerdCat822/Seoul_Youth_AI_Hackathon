package kr.trylog.forecast;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DemoForecastController {
    private final DemoForecast forecast = DemoForecast.fromSample();

    @GetMapping("/api/v1/demo/forecast")
    public DemoForecast forecast() {
        return forecast;
    }
}
