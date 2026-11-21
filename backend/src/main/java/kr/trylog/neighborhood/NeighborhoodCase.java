package kr.trylog.neighborhood;

import kr.trylog.experiment.Category;

public record NeighborhoodCase(
        String id, String title, Category category, Difficulty difficulty,
        int cost, int durationDays, String summary, String tip,
        int sampleSize, int improved, int unchanged, int declined, boolean demo) {
    public enum Difficulty { EASY, PREPARE, PLAN }
}
