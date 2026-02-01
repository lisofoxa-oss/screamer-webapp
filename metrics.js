// ============================================================
// metrics.js — Анализ траектории и расчёт score
// Этот файл меняется чаще всего при тюнинге
// ============================================================

/**
 * Анализ траектории одного раунда
 * Возвращает все метрики из массива точек
 */
function analyzeRound(traj) {
    const r = {
        microFreeze: 0, freezeOnset: 0,
        directionError: 0, speedVariability: 0,
        totalJerk: 0, jerkPeakLatency: 0,
        sinuosity: 1, trajectoryLength: 0,
        contactAreaAvg: 0, contactAreaMax: 0, contactAreaDelta: 0,
        forceAvg: 0, forceMax: 0, forceDelta: 0,
        pointCount: traj.length,
        avgSpeed: 0, maxSpeed: 0,
        directionChanges: 0
    };
    if (traj.length < 2) return r;

    // --- Trajectory length & sinuosity ---
    let totalPath = 0;
    for (let i = 1; i < traj.length; i++) totalPath += traj[i].distance || 0;
    r.trajectoryLength = totalPath;

    const directDist = _dist(traj[0].x, traj[0].y, traj[traj.length-1].x, traj[traj.length-1].y);
    r.sinuosity = directDist > 10 ? totalPath / directDist : 1;

    // --- Micro-freeze & freeze onset ---
    let frozenStart = 0;
    for (let i = 1; i < traj.length; i++) {
        const gap = traj[i].t - traj[i-1].t;
        if (gap > 50 && !r.microFreeze) r.microFreeze = gap;
        if (traj[i].speed < 30) {
            if (!frozenStart) frozenStart = traj[i].t;
            else if (traj[i].t - frozenStart > 50 && !r.freezeOnset) {
                r.freezeOnset = frozenStart - traj[0].t;
            }
        } else { frozenStart = 0; }
    }

    // --- Direction error ---
    let totalAngle = 0, angleCount = 0;
    for (const p of traj) {
        if (!isNaN(p.angle) && p.distance > 3) { totalAngle += p.angle; angleCount++; }
    }
    r.directionError = angleCount > 0 ? totalAngle / angleCount : 0;

    // --- Direction changes (zigzag count) ---
    let changes = 0;
    for (let i = 2; i < traj.length; i++) {
        const cross = traj[i-1].dx * traj[i].dy - traj[i-1].dy * traj[i].dx;
        const prevCross = traj[i-2].dx * traj[i-1].dy - traj[i-2].dy * traj[i-1].dx;
        if ((cross > 0 && prevCross < 0) || (cross < 0 && prevCross > 0)) changes++;
    }
    r.directionChanges = changes;

    // --- Speed stats ---
    const speeds = traj.filter(p => p.speed > 0 && !isNaN(p.speed)).map(p => p.speed);
    if (speeds.length > 0) {
        r.avgSpeed = speeds.reduce((a,b) => a+b, 0) / speeds.length;
        r.maxSpeed = Math.max(...speeds);
    }
    if (speeds.length > 2) {
        const avg = r.avgSpeed;
        const variance = speeds.reduce((s, v) => s + (v-avg)**2, 0) / speeds.length;
        r.speedVariability = avg > 0 ? Math.sqrt(variance) / avg : 0;
    }

    // --- Jerk ---
    let maxJerk = 0, maxJerkIdx = 0;
    for (let i = 1; i < speeds.length; i++) {
        const j = Math.abs(speeds[i] - speeds[i-1]);
        r.totalJerk += j;
        if (j > maxJerk) { maxJerk = j; maxJerkIdx = i; }
    }
    if (maxJerkIdx > 0 && traj[maxJerkIdx]) {
        r.jerkPeakLatency = traj[maxJerkIdx].t - traj[0].t;
    }

    // --- Contact area & force (touch biometrics) ---
    const areas = traj.filter(p => p.contactArea > 0).map(p => p.contactArea);
    if (areas.length > 0) {
        r.contactAreaAvg = areas.reduce((a,b) => a+b, 0) / areas.length;
        r.contactAreaMax = Math.max(...areas);
        r.contactAreaDelta = r.contactAreaMax - Math.min(...areas);
    }
    const forces = traj.filter(p => p.force > 0).map(p => p.force);
    if (forces.length > 0) {
        r.forceAvg = forces.reduce((a,b) => a+b, 0) / forces.length;
        r.forceMax = Math.max(...forces);
        r.forceDelta = r.forceMax - Math.min(...forces);
    }

    return r;
}

/**
 * Средние метрики по массиву раундов (калибровка)
 * Фильтрует фантомные ловли (catchTime < 100)
 */
function avgMetrics(rounds) {
    const valid = rounds.filter(r => r.catchTime > 100 && !r.missed);
    if (!valid.length) return {
        startDelay: 450, catchTime: 650, returnTime: 350,
        directionError: 5, speedVariability: 0.9, totalJerk: 4500,
        sinuosity: 1.02, recoilDistance: 250, trajectoryLength: 300,
        forceAvg: 0.08, avgSpeed: 0, directionChanges: 0
    };
    const avg = key => valid.reduce((a,b) => a + (b[key] || 0), 0) / valid.length;
    return {
        startDelay: avg('startDelay'), catchTime: avg('catchTime'), returnTime: avg('returnTime'),
        directionError: avg('directionError'), speedVariability: avg('speedVariability'),
        totalJerk: avg('totalJerk'), sinuosity: avg('sinuosity'),
        recoilDistance: avg('recoilDistance'), trajectoryLength: avg('trajectoryLength'),
        forceAvg: avg('forceAvg'), avgSpeed: avg('avgSpeed'),
        directionChanges: avg('directionChanges')
    };
}

/**
 * Вычисление score 0-100
 *
 * Основные наблюдения из реальных данных:
 * - Испуг УСКОРЯЕТ catchTime (адреналин), а не замедляет
 * - recoilDistance — самый стабильный маркер (+20-60% при испуге)
 * - totalJerk — второй по надёжности (+15-60%)
 * - Фейк-скример даёт directionError, реальный — jerk
 * - startDelay при скримере может быть как меньше (адреналин), так и больше (ступор)
 */
function computeScore(scr, fake, avgPre, avgPost) {
    let score = 0;
    const details = [];

    // --- Потеря / не поймал ---
    if (!scr || scr.lost) {
        score += 55;
        details.push('Lost/missed: +55');
        if (avgPost.catchTime > avgPre.catchTime * 1.05) {
            score += 5; details.push('PostDeg: +5');
        }
        return { score: Math.min(100, score), details };
    }

    // ==============================
    // TIER 1: Самые надёжные метрики
    // ==============================

    // 1. Recoil distance — проскок после ловли (max 20 pts)
    //    Самый стабильный маркер: +20-60% при испуге
    if (avgPre.recoilDistance > 0) {
        const ratio = scr.recoilDistance / avgPre.recoilDistance;
        if (ratio > 1.1) {
            const p = Math.min(20, Math.round((ratio - 1) * 35));
            score += p;
            details.push(`Recoil(${Math.round(scr.recoilDistance)} vs ${Math.round(avgPre.recoilDistance)}, x${ratio.toFixed(2)}): +${p}`);
        }
    } else if (scr.recoilDistance > 300) {
        score += 8;
        details.push(`RecoilAbs(${Math.round(scr.recoilDistance)}px): +8`);
    }

    // 2. TotalJerk — рывки (max 18 pts)
    //    Второй по надёжности: +15-60%
    if (avgPre.totalJerk > 0) {
        const ratio = scr.totalJerk / avgPre.totalJerk;
        if (ratio > 1.15) {
            const p = Math.min(18, Math.round((ratio - 1) * 25));
            score += p;
            details.push(`Jerk(${Math.round(scr.totalJerk)} vs ${Math.round(avgPre.totalJerk)}, x${ratio.toFixed(2)}): +${p}`);
        }
    } else if (scr.totalJerk > 6000) {
        score += 8;
        details.push(`JerkAbs(${Math.round(scr.totalJerk)}): +8`);
    }

    // ==============================
    // TIER 2: Хорошие метрики
    // ==============================

    // 3. Adrenaline boost — catchTime УМЕНЬШИЛСЯ (max 12 pts)
    //    Испуг ускоряет реакцию!
    if (avgPre.catchTime > 0 && scr.catchTime > 0) {
        const ratio = scr.catchTime / avgPre.catchTime;
        if (ratio < 0.9) {
            // Ускорился — адреналин от испуга
            const boost = 1 - ratio; // 0.1 = 10% быстрее
            const p = Math.min(12, Math.round(boost * 60));
            score += p;
            details.push(`Adrenaline(${Math.round(scr.catchTime)} vs ${Math.round(avgPre.catchTime)}, x${ratio.toFixed(2)}): +${p}`);
        } else if (ratio > 1.1) {
            // Замедлился — тоже испуг (ступор)
            const p = Math.min(12, Math.round((ratio - 1) * 30));
            score += p;
            details.push(`Slowdown(x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 4. Trajectory length increase (max 10 pts)
    //    Длинный путь = палец метался
    if (avgPre.trajectoryLength > 0) {
        const ratio = scr.trajectoryLength / avgPre.trajectoryLength;
        if (ratio > 1.15) {
            const p = Math.min(10, Math.round((ratio - 1) * 25));
            score += p;
            details.push(`TrajLength(${Math.round(scr.trajectoryLength)} vs ${Math.round(avgPre.trajectoryLength)}, x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 5. Sinuosity (зигзаг) (max 8 pts)
    if (scr.sinuosity > 1.02 && avgPre.sinuosity > 0) {
        const ratio = scr.sinuosity / avgPre.sinuosity;
        if (ratio > 1.1) {
            const p = Math.min(8, Math.round((ratio - 1) * 30));
            score += p;
            details.push(`Sinuosity(${scr.sinuosity.toFixed(3)} vs ${avgPre.sinuosity.toFixed(3)}): +${p}`);
        }
    }

    // ==============================
    // TIER 3: Дополнительные сигналы
    // ==============================

    // 6. SpeedVariability increase (max 6 pts)
    if (avgPre.speedVariability > 0 && scr.speedVariability > avgPre.speedVariability * 1.15) {
        const p = Math.min(6, Math.round((scr.speedVariability / avgPre.speedVariability - 1) * 15));
        score += p;
        details.push(`SpeedVar(${scr.speedVariability.toFixed(2)} vs ${avgPre.speedVariability.toFixed(2)}): +${p}`);
    }

    // 7. MicroFreeze (max 5 pts)
    if (scr.microFreeze > 100) {
        const p = Math.min(5, Math.round(scr.microFreeze / 60));
        score += p;
        details.push(`MicroFreeze(${scr.microFreeze}ms): +${p}`);
    }

    // 8. Contact area spike (max 8 pts) — если устройство поддерживает
    if (scr.contactAreaDelta > 500) {
        const p = Math.min(8, Math.round(scr.contactAreaDelta / 300));
        score += p;
        details.push(`ContactSpike(${Math.round(scr.contactAreaDelta)}): +${p}`);
    }

    // 9. Force delta — если устройство поддерживает (max 6 pts)
    if (scr.forceDelta > 0.02 && avgPre.forceAvg > 0) {
        const p = Math.min(6, Math.round(scr.forceDelta / 0.01));
        score += p;
        details.push(`ForceDelta(${scr.forceDelta.toFixed(3)}): +${p}`);
    }

    // 10. Real vs Fake comparison (max 8 pts)
    //     Если реакция на скример сильнее чем на котёнка — чистый испуг
    if (fake && !fake.lost && scr.totalJerk > 0 && fake.totalJerk > 0) {
        const jerkRatio = scr.totalJerk / fake.totalJerk;
        if (jerkRatio > 1.3) {
            const p = Math.min(8, Math.round((jerkRatio - 1) * 15));
            score += p;
            details.push(`RealVsFake(jerk x${jerkRatio.toFixed(2)}): +${p}`);
        }
        // Recoil comparison too
        if (fake.recoilDistance > 0 && scr.recoilDistance / fake.recoilDistance > 1.3) {
            const rr = scr.recoilDistance / fake.recoilDistance;
            const p = Math.min(5, Math.round((rr - 1) * 10));
            score += p;
            details.push(`RealVsFakeRecoil(x${rr.toFixed(2)}): +${p}`);
        }
    }

    // 11. Post-screamer degradation (max 5 pts)
    if (avgPost.catchTime > avgPre.catchTime * 1.05) {
        score += 5;
        details.push('PostDeg: +5');
    }

    // 12. Flinch — startDelay near 0 = рефлекторный рывок (max 10 pts)
    //     Но только если directionError тоже высокий (палец полетел не туда)
    if (scr.startDelay < 80 && scr.directionError > 15) {
        const p = Math.min(10, Math.round(scr.directionError / 3));
        score += p;
        details.push(`Flinch(sd=${scr.startDelay}, dir=${scr.directionError.toFixed(0)}°): +${p}`);
    }

    return { score: Math.min(100, Math.max(0, Math.round(score))), details };
}

// Helper (нужен до загрузки game.js)
function _dist(x1, y1, x2, y2) {
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}
