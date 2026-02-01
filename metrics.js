// ============================================================
// metrics.js v3 — Исправленная формула по данным 20 сессий
//
// Ключевые изменения:
// - shockDuration добавлен (95% reliability — БЫЛ НЕ В ФОРМУЛЕ)
// - Freeze-детектор: shock>350 + recoil≤baseline = паралич
// - Recoil: убрано наказание за низкий (freeze ≠ "не испугался")
// - Sinuosity снижен (30% reliability)
// - startDelay убран как компонент (55% = монетка)
// ============================================================

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

    let totalPath = 0;
    for (let i = 1; i < traj.length; i++) totalPath += traj[i].distance || 0;
    r.trajectoryLength = totalPath;
    const directDist = _dist(traj[0].x, traj[0].y, traj[traj.length-1].x, traj[traj.length-1].y);
    r.sinuosity = directDist > 10 ? totalPath / directDist : 1;

    let frozenStart = 0;
    for (let i = 1; i < traj.length; i++) {
        const gap = traj[i].t - traj[i-1].t;
        if (gap > 50 && !r.microFreeze) r.microFreeze = gap;
        if (traj[i].speed < 30) {
            if (!frozenStart) frozenStart = traj[i].t;
            else if (traj[i].t - frozenStart > 50 && !r.freezeOnset)
                r.freezeOnset = frozenStart - traj[0].t;
        } else frozenStart = 0;
    }

    let totalAngle = 0, angleCount = 0;
    for (const p of traj) {
        if (!isNaN(p.angle) && p.distance > 3) { totalAngle += p.angle; angleCount++; }
    }
    r.directionError = angleCount > 0 ? totalAngle / angleCount : 0;

    let changes = 0;
    for (let i = 2; i < traj.length; i++) {
        const cross = traj[i-1].dx * traj[i].dy - traj[i-1].dy * traj[i].dx;
        const prevCross = traj[i-2].dx * traj[i-1].dy - traj[i-2].dy * traj[i-1].dx;
        if ((cross > 0 && prevCross < 0) || (cross < 0 && prevCross > 0)) changes++;
    }
    r.directionChanges = changes;

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

    let maxJerk = 0, maxJerkIdx = 0;
    for (let i = 1; i < speeds.length; i++) {
        const j = Math.abs(speeds[i] - speeds[i-1]);
        r.totalJerk += j;
        if (j > maxJerk) { maxJerk = j; maxJerkIdx = i; }
    }
    if (maxJerkIdx > 0 && traj[maxJerkIdx])
        r.jerkPeakLatency = traj[maxJerkIdx].t - traj[0].t;

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
 * Score 0-100 (v3) — данные 20 сессий
 *
 * Reliability: shockDuration 95%, recoil 80%, jerk 80%, sinuosity 30%
 * Два паттерна: FLINCH (recoil↑ jerk↑) и FREEZE (shock↑ recoil↓)
 */
function computeScore(scr, fake, avgPre, avgPost) {
    let score = 0;
    const details = [];

    if (!scr || scr.lost) {
        score += 55;
        details.push('Lost/missed: +55');
        if (avgPost.catchTime > avgPre.catchTime * 1.05) {
            score += 5; details.push('PostDeg: +5');
        }
        return { score: Math.min(100, score), details };
    }

    // === TIER 1: Доказанные метрики ===

    // 1. ShockDuration — 95% reliability (max 18)
    const shock = scr.shockDuration || 0;
    if (shock > 150) {
        const p = Math.min(18, Math.round((shock - 150) / 35));
        score += p;
        details.push(`ShockDur(${shock}ms): +${p}`);
    }

    // 2. Recoil — 80% reliability (max 18, без наказания за freeze)
    if (avgPre.recoilDistance > 0) {
        const ratio = scr.recoilDistance / avgPre.recoilDistance;
        if (ratio > 1.1) {
            const p = Math.min(18, Math.round((ratio - 1) * 35));
            score += p;
            details.push(`Recoil(${Math.round(scr.recoilDistance)} vs ${Math.round(avgPre.recoilDistance)}, x${ratio.toFixed(2)}): +${p}`);
        }
    } else if (scr.recoilDistance > 300) {
        score += 8;
        details.push(`RecoilAbs(${Math.round(scr.recoilDistance)}px): +8`);
    }

    // 3. TotalJerk — 80% reliability, r=0.836 (max 16)
    if (avgPre.totalJerk > 0) {
        const ratio = scr.totalJerk / avgPre.totalJerk;
        if (ratio > 1.15) {
            const p = Math.min(16, Math.round((ratio - 1) * 25));
            score += p;
            details.push(`Jerk(x${ratio.toFixed(2)}): +${p}`);
        }
    } else if (scr.totalJerk > 6000) {
        score += 8;
        details.push(`JerkAbs: +8`);
    }

    // === FREEZE DETECTOR (новое!) ===
    const recoilRatio = avgPre.recoilDistance > 0
        ? scr.recoilDistance / avgPre.recoilDistance : 1;
    if (shock > 350 && recoilRatio <= 1.15) {
        const intensity = Math.min(1, (shock - 350) / 400);
        const p = Math.min(14, Math.round(intensity * 14));
        score += p;
        details.push(`🧊Freeze(shock=${shock}ms,recoil=x${recoilRatio.toFixed(2)}): +${p}`);
    }

    // === TIER 2 ===

    // 4. CatchTime change (max 10)
    if (avgPre.catchTime > 0 && scr.catchTime > 0) {
        const ratio = scr.catchTime / avgPre.catchTime;
        if (ratio < 0.9) {
            const p = Math.min(10, Math.round((1 - ratio) * 50));
            score += p;
            details.push(`Adrenaline(x${ratio.toFixed(2)}): +${p}`);
        } else if (ratio > 1.1) {
            const p = Math.min(10, Math.round((ratio - 1) * 25));
            score += p;
            details.push(`Slowdown(x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 5. TrajectoryLength (max 8)
    if (avgPre.trajectoryLength > 0) {
        const ratio = scr.trajectoryLength / avgPre.trajectoryLength;
        if (ratio > 1.15) {
            const p = Math.min(8, Math.round((ratio - 1) * 20));
            score += p;
            details.push(`TrajLen(x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 6. Sinuosity — снижен до max 4 (30% reliability)
    if (scr.sinuosity > 1.02 && avgPre.sinuosity > 0) {
        const ratio = scr.sinuosity / avgPre.sinuosity;
        if (ratio > 1.15) {
            const p = Math.min(4, Math.round((ratio - 1) * 15));
            score += p;
            details.push(`Sinuosity: +${p}`);
        }
    }

    // === TIER 3 ===

    // 7. SpeedVariability (max 5)
    if (avgPre.speedVariability > 0 && scr.speedVariability > avgPre.speedVariability * 1.15) {
        const p = Math.min(5, Math.round((scr.speedVariability / avgPre.speedVariability - 1) * 12));
        score += p;
        details.push(`SpeedVar: +${p}`);
    }

    // 8. MicroFreeze (max 4)
    if (scr.microFreeze > 100) {
        const p = Math.min(4, Math.round(scr.microFreeze / 80));
        score += p;
        details.push(`MicroFreeze(${scr.microFreeze}ms): +${p}`);
    }

    // 9. Contact area (max 6)
    if (scr.contactAreaDelta > 500) {
        const p = Math.min(6, Math.round(scr.contactAreaDelta / 350));
        score += p;
        details.push(`Contact: +${p}`);
    }

    // 10. Force (max 5)
    if (scr.forceDelta > 0.02 && avgPre.forceAvg > 0) {
        const p = Math.min(5, Math.round(scr.forceDelta / 0.012));
        score += p;
        details.push(`Force: +${p}`);
    }

    // 11. Real vs Fake (max 8)
    if (fake && !fake.lost && scr.totalJerk > 0 && fake.totalJerk > 0) {
        const jr = scr.totalJerk / fake.totalJerk;
        if (jr > 1.3) {
            const p = Math.min(5, Math.round((jr - 1) * 12));
            score += p;
            details.push(`RvF-Jerk(x${jr.toFixed(2)}): +${p}`);
        }
        if (fake.recoilDistance > 0 && scr.recoilDistance / fake.recoilDistance > 1.3) {
            const rr = scr.recoilDistance / fake.recoilDistance;
            const p = Math.min(3, Math.round((rr - 1) * 8));
            score += p;
            details.push(`RvF-Recoil: +${p}`);
        }
    }

    // 12. Post degradation (5)
    if (avgPost.catchTime > avgPre.catchTime * 1.05) {
        score += 5;
        details.push('PostDeg: +5');
    }

    // 13. Flinch (max 8)
    if (scr.startDelay < 80 && scr.directionError > 15) {
        const p = Math.min(8, Math.round(scr.directionError / 4));
        score += p;
        details.push(`Flinch(sd=${scr.startDelay}): +${p}`);
    }

    return { score: Math.min(100, Math.max(0, Math.round(score))), details };
}

function _dist(x1, y1, x2, y2) {
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}
