#!/usr/bin/env python3
"""Writes a small uncompressed PDF that mimics a Question Bank export (one question per page)."""
import sys

QUESTIONS = [
    [
        "Question ID: 960dec02",
        "Assessment Test Domain Skill Difficulty",
        "SAT Reading and Writing Standard English Boundaries Medium",
        "Conventions",
        "Question",
        "A recent study of coastal towns found that sea walls built in the 1950s _____ many",
        "of them are now too low.",
        "Which choice completes the text so that it conforms to the conventions of Standard English?",
        "A. 1950s, and",
        "B. 1950s;",
        "C. 1950s",
        "D. 1950s, because",
        "Answer",
        "Correct Answer: B",
        "Rationale",
        "Choice B is the best answer. The semicolon correctly joins two independent clauses.",
    ],
    [
        "Question ID: 37e5c794",
        "Assessment Test Domain Skill Difficulty",
        "SAT Reading and Writing Expression of Ideas Transitions Easy",
        "Question",
        "Coral reefs are vital ecosystems. _____ they protect coastlines from storms.",
        "Which choice completes the text with the most logical transition?",
        "A. Nevertheless,",
        "B. In addition,",
        "C. For example,",
        "D. Instead,",
        "Answer",
        "Rationale",
        "Choice B is the best answer because the second sentence adds a benefit to the first.",
    ],
]


def esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def page_stream(lines):
    ops = ["BT", "/F1 9 Tf"]
    y = 740
    for line in lines:
        ops.append(f"1 0 0 1 36 {y} Tm ({esc(line)}) Tj")
        y -= 14
    ops.append("ET")
    return "\n".join(ops).encode("latin-1")


def build(out_path):
    objects = []  # list of bytes
    def add(obj):
        objects.append(obj)
        return len(objects)
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    page_ids = []
    content_ids = []
    pages_id_placeholder = None
    # reserve pages object index
    pages_index = add(b"PLACEHOLDER")
    for q in QUESTIONS:
        stream = page_stream(q)
        cid = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        pid = add(
            (f"<< /Type /Page /Parent {pages_index} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {font} 0 R >> >> /Contents {cid} 0 R >>").encode()
        )
        page_ids.append(pid)
    kids = " ".join(f"{p} 0 R" for p in page_ids)
    objects[pages_index - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    catalog = add(f"<< /Type /Catalog /Pages {pages_index} 0 R >>".encode())
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    with open(out_path, "wb") as f:
        f.write(out)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures/qb-export.pdf")
