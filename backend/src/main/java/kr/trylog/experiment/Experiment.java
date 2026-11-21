package kr.trylog.experiment;

import java.time.LocalDate;

record Experiment(String id, int storeId, String title, String category, String actionType,
                  String targetMenuCode, LocalDate startDate, LocalDate endDate, String notes) { }
