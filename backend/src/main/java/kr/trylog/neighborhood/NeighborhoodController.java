package kr.trylog.neighborhood;

import java.util.List;
import kr.trylog.experiment.Category;
import kr.trylog.neighborhood.NeighborhoodCase.Difficulty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cases")
public class NeighborhoodController {
    // Fictional fixtures, not aggregated merchant data or an AI recommendation.
    private static final List<NeighborhoodCase> CASES = List.of(
            new NeighborhoodCase("menu-badge", "점심 세트에 추천 표시 붙이기", Category.MENU,
                    Difficulty.EASY, 0, 14, "메뉴를 고르기 쉽게 추천 표시를 붙였어요.",
                    "가격과 구성은 그대로 두고 추천 표시 한 가지만 바꿔보세요.", 12, 7, 3, 2, true),
            new NeighborhoodCase("menu-description", "세트 메뉴 설명을 알기 쉽게 바꾸기", Category.MENU,
                    Difficulty.EASY, 0, 14, "몇 명이 먹기 좋은지, 무엇이 들어가는지 적었어요.",
                    "손님이 자주 묻는 내용을 한 줄로 적어보세요.", 10, 5, 3, 2, true),
            new NeighborhoodCase("menu-photo", "메뉴 사진을 잘 보이는 곳에 두기", Category.MENU,
                    Difficulty.PREPARE, 5000, 14, "세트 사진을 메뉴판 첫 장에 배치했어요.",
                    "평소 제공하는 양과 같은 사진을 준비해보세요.", 9, 5, 2, 2, true),
            new NeighborhoodCase("pickup-sign", "포장 주문 안내를 입구에 놓기", Category.OPERATION,
                    Difficulty.PREPARE, 0, 14, "포장 대기 위치를 종이 안내문으로 표시했어요.",
                    "길을 막지 않는 위치에 안내를 두고 손님 동선을 살펴보세요.", 8, 4, 3, 1, true),
            new NeighborhoodCase("quiet-hours", "한산한 시간에 준비 순서 바꾸기", Category.OPERATION,
                    Difficulty.PLAN, 0, 14, "점심 전 재료 준비 순서를 정리했어요.",
                    "주문 대기시간을 같은 시간대끼리 기록해보세요.", 11, 6, 2, 3, true),
            new NeighborhoodCase("shop-intro", "가게 소개에 대표 메뉴 한 줄 더하기", Category.MARKETING,
                    Difficulty.EASY, 0, 14, "가게 소개에 대표 메뉴와 이용 시간을 덧붙였어요.",
                    "정확한 영업시간을 확인하고 손님에게 유용한 내용부터 적어보세요.", 7, 3, 3, 1, true)
    );

    @GetMapping
    public List<NeighborhoodCase> list() {
        return CASES;
    }
}
