"""Build the key-free address search directory from Korea Post's regional address ZIP.

Source and file specification (지역별 주소 DB):
https://www.epost.go.kr/search/zipcode/areacdAddressDown.jsp
Download zipcode_DB.zip and run this script with its path using Python 3.11+.
The bundled snapshot uses the November 10, 2026 release (addresses as of November 9).
It covers Seoul and every address with legal or administrative dong 여의동 / 여의도동.
Only public address components are used. Building/addressee names are not exported.
"""

import argparse
import csv
import gzip
import io
from pathlib import Path
import zipfile


DEFAULT_DESTINATION = Path(__file__).resolve().parents[1] / "src/main/resources/address/local-addresses.tsv.gz"
HEADER = ("roadAddress", "jibunAddress", "postalCode", "megaNm", "ctyNm", "ctyCd", "searchAliases")
NEIGHBORHOODS = {"여의동", "여의도동"}


def parts(*tokens):
    return " ".join(token for token in tokens if token)


def number(main, sub):
    return main if sub in ("", "0") else f"{main}-{sub}"


def included(row, provinces):
    return (
        row["시도"] in provinces
        or row["법정동명"] in NEIGHBORHOODS
        or row["행정동명"] in NEIGHBORHOODS
    )


def address_fields(row):
    province = row["시도"]
    district = row["시군구"]
    prefix = parts(province, district, row["읍면"])
    postcode, legal_code = row["우편번호"], row["법정동코드"]
    if not (len(postcode) == 5 and postcode.isdigit() and len(legal_code) == 10 and legal_code.isdigit()):
        raise ValueError(f"Unexpected postal or legal-dong code for {prefix}: {postcode}, {legal_code}")
    road_number = number(row["건물번호본번"], row["건물번호부번"])
    road = parts(prefix, row["도로명"], {"0": "", "1": "지하", "2": "공중"}[row["지하여부"]], road_number)
    lot_number = ("산" if row["산여부"] == "1" else "") + number(row["지번본번"], row["지번부번"])
    lot = parts(prefix, row["법정동명"], row["리명"], lot_number)
    aliases = parts(*dict.fromkeys((row["행정동명"], row["법정동명"], row["읍면"], row["리명"])))
    return road, lot, postcode, province, district or province, legal_code[:5], aliases


def read_addresses(archive, provinces):
    addresses = set()
    # The archive supplies UTF-8 file contents and CP949 member names.
    with zipfile.ZipFile(archive, metadata_encoding="cp949") as data:
        for member in data.infolist():
            if not member.filename.lower().endswith(".txt"):
                continue
            with data.open(member) as raw:
                lines = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
                reader = csv.DictReader(lines, delimiter="|")
                for row in reader:
                    if included(row, provinces):
                        addresses.add(address_fields(row))
    if not addresses:
        raise ValueError("No address records matched this source archive.")
    return sorted(addresses)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Internet Post Office regional address database (zipcode_DB.zip)")
    parser.add_argument("--include-province", action="append", default=["서울특별시"], metavar="NAME",
                        help="Also include all addresses of this province, as named in the source")
    parser.add_argument("--output", type=Path, default=DEFAULT_DESTINATION)
    args = parser.parse_args()
    rows = read_addresses(args.archive, set(args.include_province))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as file, gzip.GzipFile(filename="", fileobj=file, mode="wb", mtime=0) as zipped:
        with io.TextIOWrapper(zipped, encoding="utf-8", newline="") as text:
            writer = csv.writer(text, delimiter="\t", lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(rows)
    print(f"{len(rows):,} unique address rows, {args.output.stat().st_size:,} compressed bytes")


if __name__ == "__main__":
    main()
