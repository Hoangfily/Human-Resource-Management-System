"""Which shift an employee works on a given day (shared by the OVERTIME and ATTENDANCE agents)."""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ..schemas.requests import EmployeeContext, ScheduleEntry, company_tz

_SHIFT_TIME = re.compile(r"(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})")


@dataclass(frozen=True)
class ShiftWindow:
    start: datetime
    end: datetime
    source: str  # "schedule" | "defaultShift"

    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600

    def to_prompt(self) -> dict[str, str]:
        return {"source": self.source, "start": f"{self.start:%H:%M}", "end": f"{self.end:%H:%M}"}


def shift_for_day(day: date, schedule: ScheduleEntry | None, employee: EmployeeContext) -> ShiftWindow | None:
    """The assigned schedule, else the default shift on a weekday (COMPANY.WORKING_DAYS is Mon-Fri)."""
    tz = company_tz()
    if schedule:
        return ShiftWindow(schedule.shift_start.astimezone(tz), schedule.shift_end.astimezone(tz), "schedule")
    if day.weekday() >= 5:
        return None
    match = _SHIFT_TIME.search(employee.shift_time or "")
    if not match:
        return None
    start, end = (datetime.combine(day, datetime.strptime(t, "%H:%M").time(), tz) for t in match.groups())
    if end <= start:
        end += timedelta(days=1)  # Overnight default shift, e.g. "22:00 - 06:00"
    return ShiftWindow(start, end, "defaultShift")
