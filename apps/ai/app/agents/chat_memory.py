"""Short-lived chat history, kept in the AI process (lost on restart; one instance only).

Keyed by (employee_id, conversation_id): a conversation id guessed or reused by another
employee starts an empty history instead of reading someone else's messages.
"""

import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Turn:
    user: str
    assistant: str


class ConversationStore:
    def __init__(
        self,
        *,
        max_turns: int = 10,
        ttl_s: float = 30 * 60,
        max_conversations: int = 1000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_turns = max_turns
        self.ttl_s = ttl_s
        self.max_conversations = max_conversations
        self._clock = clock
        # Least recently used first: (employee_id, conversation_id) -> (last used, turns)
        self._items: OrderedDict[tuple[str, str], tuple[float, list[Turn]]] = OrderedDict()

    def history(self, employee_id: str, conversation_id: str) -> list[Turn]:
        self._drop_expired()
        item = self._items.get((employee_id, conversation_id))
        return list(item[1]) if item else []

    def add(self, employee_id: str, conversation_id: str, turn: Turn) -> None:
        self._drop_expired()
        key = (employee_id, conversation_id)
        turns = self._items.pop(key, (0.0, []))[1]
        turns = [*turns, turn][-self.max_turns :]
        self._items[key] = (self._clock(), turns)
        while len(self._items) > self.max_conversations:  # Bounded memory: forget the least recent
            self._items.popitem(last=False)

    def _drop_expired(self) -> None:
        cutoff = self._clock() - self.ttl_s
        while self._items:
            key, (last_used, _) = next(iter(self._items.items()))
            if last_used >= cutoff:
                break
            del self._items[key]
