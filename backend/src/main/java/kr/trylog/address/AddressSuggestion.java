package kr.trylog.address;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Optional;
import java.util.regex.Pattern;

public record AddressSuggestion(String roadAddress, String jibunAddress, String postalCode,
                                String megaNm, String ctyNm, String ctyCd) {
    private static final Pattern FIVE_DIGITS = Pattern.compile("[0-9]{5}");

    @JsonProperty public String address() { return roadAddress; }
    @JsonProperty public String megaCd() { return ctyCd.substring(0, 2); }

    static Optional<AddressSuggestion> from(String road, String lot, String postal, String province,
                                             String district, String code) {
        // Sejong is both a province-level city and a district in the signup schema.
        String districtName = district.isBlank() && code.equals("36110") ? province : district;
        if (road.isBlank() || road.length() > 300 || !FIVE_DIGITS.matcher(postal).matches()
                || !FIVE_DIGITS.matcher(code).matches() || province.isBlank() || province.length() > 30
                || districtName.isBlank() || districtName.length() > 30) {
            return Optional.empty();
        }
        return Optional.of(new AddressSuggestion(road, lot, postal, province, districtName, code));
    }
}
