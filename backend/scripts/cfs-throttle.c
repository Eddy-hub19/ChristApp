/*
 * Емуляція CFS-квоти (cgroup cpu.max) для процесу на macOS: у кожному періоді процес може спожити не більше
 * quota_ms CPU-часу (усі потоки разом), далі його SIGSTOP-ають до кінця періоду. Так працює тротлінг Render:
 * 0.5 vCPU = 50 мс на кожні 100 мс.
 *
 *   clang -O2 -o cfs-throttle scripts/cfs-throttle.c
 *   ./cfs-throttle <pid> <quota_ms> [period_ms=100]
 *
 * quota_ms задається в "наших" мс: якщо ядро Render у S разів повільніше за цю машину, ставте (50 / S).
 * Виходить сам, коли процес зникає. Використовується в scripts/load-scenarios.ts (LOAD_QUOTA_MS).
 */
#include <libproc.h>
#include <mach/mach_time.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

static uint64_t now_ns(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * 1000000000ull + ts.tv_nsec;
}

static int cpu_ns(int pid, uint64_t *out) {
  struct proc_taskinfo ti;
  if (proc_pidinfo(pid, PROC_PIDTASKINFO, 0, &ti, sizeof ti) != (int)sizeof ti) return -1;
  // pti_total_* - у тактах mach_absolute_time (на Apple Silicon це не наносекунди)
  static mach_timebase_info_data_t tb;
  if (tb.denom == 0) mach_timebase_info(&tb);
  *out = (ti.pti_total_user + ti.pti_total_system) * tb.numer / tb.denom;
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <pid> <quota_ms> [period_ms]\n", argv[0]);
    return 2;
  }
  int pid = atoi(argv[1]);
  double quota_ms = atof(argv[2]);
  double period_ms = argc > 3 ? atof(argv[3]) : 100.0;
  uint64_t quota = (uint64_t)(quota_ms * 1e6), period = (uint64_t)(period_ms * 1e6);
  uint64_t start = now_ns(), base;
  if (cpu_ns(pid, &base) != 0) return 1;
  int stopped = 0;
  for (;;) {
    uint64_t t = now_ns(), c;
    if (cpu_ns(pid, &c) != 0) return 0;
    if (t - start >= period) {
      start = t;
      base = c;
      if (stopped) { kill(pid, SIGCONT); stopped = 0; }
    } else if (!stopped && c - base >= quota) {
      kill(pid, SIGSTOP);
      stopped = 1;
    }
    usleep(500);
  }
}
