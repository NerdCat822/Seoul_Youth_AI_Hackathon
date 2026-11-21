package kr.trylog.address;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

@Component
class LocalAddressDirectory {
    private static final String HEADER = "roadAddress\tjibunAddress\tpostalCode\tmegaNm\tctyNm\tctyCd\tsearchAliases";
    // One original compact row per address. Splitting half a million rows into DTOs and a second
    // searchable copy at startup would take much of the deployed server's 512 MiB heap.
    private final List<List<String>> districts;

    LocalAddressDirectory(@Value("classpath:address/local-addresses.tsv.gz") Resource resource) throws IOException {
        Map<String, List<String>> byDistrict = new LinkedHashMap<>();
        try (var reader = new BufferedReader(new InputStreamReader(
                new GZIPInputStream(resource.getInputStream()), StandardCharsets.UTF_8))) {
            if (!HEADER.equals(reader.readLine())) throw new IOException("Invalid address catalog header");
            String line;
            while ((line = reader.readLine()) != null) {
                int end = line.lastIndexOf('\t');
                if (end < 6 || line.charAt(end - 6) != '\t') throw new IOException("Invalid address catalog row");
                String code = line.substring(end - 5, end);
                byDistrict.computeIfAbsent(code, ignored -> new ArrayList<>()).add(line);
            }
        }
        districts = List.copyOf(byDistrict.values());
    }

    AddressSearchController.Results search(String query, int page, int limit) {
        String[] terms = query.split(" ");
        boolean hasStreet = false;
        boolean hasTown = false;
        for (int i = 0; i < terms.length; i++) {
            if (terms[i].equals("서울시")) terms[i] = "서울특별시";
            if (terms[i].equals("전북도")) terms[i] = "전북특별자치도";
            String term = terms[i];
            hasStreet |= term.endsWith("로") || term.endsWith("길");
            hasTown |= term.endsWith("동") || term.endsWith("리") || term.endsWith("면") || term.endsWith("읍") || term.endsWith("가");
        }
        var matches = new ArrayList<AddressSuggestion>(limit);
        var cursors = new ArrayList<DistrictCursor>(districts.size());
        districts.forEach(group -> cursors.add(new DistrictCursor(group.iterator())));
        long skip = (long) (page - 1) * limit;
        // Round-robin over *matches*, so identically named neighbourhoods in different cities
        // (e.g. Seoul and Jeonju) can both appear on the first page.
        while (!cursors.isEmpty()) {
            var remaining = cursors.iterator();
            while (remaining.hasNext()) {
                var cursor = remaining.next();
                String row = cursor.nextMatch(terms, hasStreet, hasTown);
                if (row == null) {
                    remaining.remove();
                    continue;
                }
                if (skip > 0) {
                    skip--;
                    continue;
                }
                if (matches.size() == limit) return new AddressSearchController.Results(matches, true, "local");
                String[] f = row.split("\t", -1);
                AddressSuggestion.from(f[0], f[1], f[2], f[3], f[4], f[5]).ifPresent(matches::add);
            }
        }
        return new AddressSearchController.Results(matches, false, "local");
    }

    // The catalog is sorted by road address within each district. Alternate lot/administrative
    // aliases for the same road and postcode stay selectable by either spelling across pages.
    private static class DistrictCursor {
        private final Iterator<String> rows;
        private String previous;
        private int previousRoadEnd;
        private int previousZipStart;

        DistrictCursor(Iterator<String> rows) { this.rows = rows; }

        String nextMatch(String[] terms, boolean hasStreet, boolean hasTown) {
            while (rows.hasNext()) {
                String row = rows.next();
                if (!matches(row, terms, hasStreet, hasTown)) continue;
                int roadEnd = row.indexOf('\t');
                int zipStart = row.indexOf('\t', roadEnd + 1) + 1;
                if (previous != null && previousRoadEnd == roadEnd
                        && row.regionMatches(0, previous, 0, roadEnd)
                        && row.regionMatches(zipStart, previous, previousZipStart, 5)) continue;
                previous = row;
                previousRoadEnd = roadEnd;
                previousZipStart = zipStart;
                return row;
            }
            return null;
        }
    }

    private static boolean matches(String row, String[] terms, boolean hasStreet, boolean hasTown) {
        for (String term : terms) {
            if (!row.contains(term)) return false;
        }
        // Limit the match to the two address fields and the administrative/legal dong aliases.
        // A street number must not match the postal or district code.
        int roadEnd = row.indexOf('\t');
        int lotEnd = row.indexOf('\t', roadEnd + 1);
        int aliases = row.lastIndexOf('\t') + 1;
        for (String term : terms) {
            if (Character.isDigit(term.charAt(0)) && Character.isDigit(term.charAt(term.length() - 1)) && (hasStreet || hasTown)) {
                // The last word is the building or lot number. A number inside the street name
                // itself (such as "63로") is independent of the requested building number.
                int numberEnd = hasStreet ? roadEnd : lotEnd;
                int numberStart = row.lastIndexOf(' ', numberEnd - 1) + 1;
                if (row.charAt(numberStart) == '산') numberStart++;
                int end = numberStart + term.length();
                if (!row.startsWith(term, numberStart) || (end != numberEnd && row.charAt(end) != '-')) return false;
                continue;
            }
            if (!containsTerm(row, 0, lotEnd, term) && !containsTerm(row, aliases, row.length(), term)) return false;
        }
        return true;
    }

    private static boolean containsTerm(String row, int from, int to, String term) {
        boolean number = Character.isDigit(term.charAt(0));
        for (int at = row.indexOf(term, from); at >= 0 && at + term.length() <= to; at = row.indexOf(term, at + 1)) {
            int end = at + term.length();
            if (!number || ((at == from || !Character.isDigit(row.charAt(at - 1)))
                    && (end == to || !Character.isDigit(row.charAt(end))))) return true;
        }
        return false;
    }
}
