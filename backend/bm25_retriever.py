"""
Minimal BM25 keyword retriever (pure Python, no external dependencies).

Used when no embedding provider is configured (e.g. Groq-only setup — Groq
hosts chat models but no embedding models). For single-document Q&A it
retrieves the same relevant chunks keyword search would, without any API.
"""
import math
import re
from typing import List

_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")
_K1, _B = 1.5, 0.75


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


class _BM25Index:
    def __init__(self, docs: List[str]):
        self.docs = docs
        self.doc_tokens = [_tokenize(d) for d in docs]
        self.doc_lens = [len(t) for t in self.doc_tokens]
        self.avgdl = (sum(self.doc_lens) / len(self.doc_lens)) if self.doc_lens else 0.0
        self.N = len(docs)

        self.df = {}
        self.tfs = []
        for tokens in self.doc_tokens:
            tf = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
            self.tfs.append(tf)
            for term in tf:
                self.df[term] = self.df.get(term, 0) + 1

    def _idf(self, term: str) -> float:
        n = self.df.get(term, 0)
        if n == 0:
            return 0.0
        return math.log((self.N - n + 0.5) / n + 1.0)

    def _score(self, query_tokens: List[str], i: int) -> float:
        score, tf_map, dl = 0.0, self.tfs[i], self.doc_lens[i]
        for term in query_tokens:
            tf = tf_map.get(term, 0)
            if tf == 0:
                continue
            score += self._idf(term) * tf * (_K1 + 1) / (
                tf + _K1 * (1 - _B + _B * dl / (self.avgdl or 1.0))
            )
        return score

    def top_k(self, query: str, k: int = 4) -> List[str]:
        q = _tokenize(query)
        scored = sorted(
            ((self._score(q, i), i) for i in range(self.N)),
            key=lambda x: x[0],
            reverse=True,
        )
        return [self.docs[i] for s, i in scored[:k] if s > 0]


class BM25Retriever:
    """Drop-in replacement for vector_store.as_retriever() in chat.py."""

    def __init__(self, docs: List[str]):
        self._index = _BM25Index(docs)

    def invoke(self, query: str):
        chunks = self._index.top_k(query, k=4)

        class _Doc:
            def __init__(self, content: str):
                self.page_content = content

        return [_Doc(c) for c in chunks]


def build_bm25_retriever(chunks: List[str]) -> BM25Retriever:
    return BM25Retriever(chunks)
