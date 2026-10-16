// ゲーム内時間。営業 7:00〜22:00 を現実の約6分で進める。開店前の準備中は止まっている。

export const OPEN_MIN = 7 * 60;
export const CLOSE_MIN = 22 * 60;
export const DAY_REAL_SEC = 360;
export const PREP_SEC = 30;
const MIN_PER_SEC = (CLOSE_MIN - OPEN_MIN) / DAY_REAL_SEC;

export function createClock() {
  return { minutes: OPEN_MIN, prepLeft: PREP_SEC };
}

export function tickPrep(clock, dt) {
  clock.prepLeft = Math.max(0, clock.prepLeft - dt);
  return clock.prepLeft === 0;
}

// 閉店時刻に達したら true
export function advanceClock(clock, dt) {
  clock.minutes = Math.min(CLOSE_MIN, clock.minutes + dt * MIN_PER_SEC);
  return clock.minutes >= CLOSE_MIN;
}

export function formatClock(minutes) {
  const m = Math.floor(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// 客が来る間隔（現実の秒）。昼と夕方は多い
export function spawnIntervalAt(minutes) {
  const hour = minutes / 60;
  if ((hour >= 11.5 && hour < 13.5) || (hour >= 17 && hour < 19.5)) return 6;
  if (hour < 8 || hour >= 20.5) return 15;
  return 10;
}
