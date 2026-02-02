// ============================================================
// metrics.js v5 — Формула v5
//
// ГЛАВНОЕ ИЗМЕНЕНИЕ: lost/missed = не "не играл", а "испугался"
//
// Данные двух новых игроков:
//   Девушка 1: shockDur=1817, traj=17px, pts=29 → ЗАМЕРЛА = 95+
//   Девушка 2: shockDur=1813, traj=4px, pts=8  → ПАРАЛИЧ = 90+
//   Старая формула: обе = 55. НЕПРАВИЛЬНО.
//
// Lost/missed теперь 55—100 в зависимости от:
//   - shockDuration (как долго в шоке)
//   - trajectoryLength (сколько реально двигался)
//   - pointCount (палец на экране?)
//   - avgSpeed (мог двигаться?)
//   - Anti-lazy: если нет trajectory И нет shock → cap 60
//
// Остальная формула = v4 (freeze detector, log shock, etc.)
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
        const dx1 = traj[i-1].x - traj[i-2].x, dy1 = traj[i-1].y - traj[i-2].y;
        const dx2 = traj[i].x - traj[i-1].x, dy2 = traj[i].y - traj[i-1].y;
        const cross = dx1*dy2 - dy1*dx2;
        if (i > 2) {
            const pdx1 = traj[i-2].x - traj[i-3].x, pdy1 = traj[i-2].y - traj[i-3].y;
            const pcross = pdx1*dy1 - pdy1*dx1;
            if (pcross * cross < 0) changes++;
        }
    }
    r.directionChanges = changes;

    const speeds = traj.map(p => p.speed).filter(s => s > 0);
    if (speeds.length > 0) {
        r.avgSpeed = speeds.reduce((a,b)=>a+b,0) / speeds.length;
        r.maxSpeed = Math.max(...speeds);
        const mean = r.avgSpeed;
        const variance = speeds.reduce((s,v) => s + (v-mean)**2, 0) / speeds.length;
        r.speedVariability = mean > 0 ? Math.sqrt(variance) / mean : 0;
    }

    let totalJerk = 0, maxJerk = 0, maxJerkTime = 0;
    for (let i = 2; i < traj.length; i++) {
        const dt1 = traj[i-1].t - traj[i-2].t, dt2 = traj[i].t - traj[i-1].t;
        if (dt1 > 0 && dt2 > 0) {
            const a1 = (traj[i-1].speed || 0) / dt1;
            const a2 = (traj[i].speed || 0) / dt2;
            const jerk = Math.abs(a2 - a1) / ((dt1+dt2)/2) * 1e6;
            totalJerk += jerk;
            if (jerk > maxJerk) { maxJerk = jerk; maxJerkTime = traj[i].t - traj[0].t; }
        }
    }
    r.totalJerk = totalJerk;
    r.jerkPeakLatency = maxJerkTime;

    const areas = traj.map(p => p.contactArea || 0).filter(a => a > 0);
    if (areas.length > 0) {
        r.contactAreaAvg = areas.reduce((a,b)=>a+b,0) / areas.length;
        r.contactAreaMax = Math.max(...areas);
        r.contactAreaDelta = r.contactAreaMax - Math.min(...areas);
    }
    const forces = traj.map(p => p.force || 0).filter(f => f > 0);
    if (forces.length > 0) {
        r.forceAvg = forces.reduce((a,b)=>a+b,0) / forces.length;
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
 * Score 0–100 (v5)
 *
 * @param {object} scr        — раунд со скримером
 * @param {object} fake       — раунд с котиком
 * @param {object} avgPre     — baseline (pre+mid)
 * @param {object} avgPost    — post-раунды
 * @param {object|null} avgMid — mid-раунды отдельно
 */
function computeScore(scr, fake, avgPre, avgPost, avgMid) {
    let score = 0;
    const details = [];

    // =============================================================
    // LOST / MISSED — теперь от 55 до 100
    //
    // Не поймать сердце после скримера = сильный показатель страха
    // НО нужна защита от ленивых/непонявших
    // =============================================================
    if (!scr || scr.lost) {
        // Извлекаем данные (даже у lost-раундов есть trajectory)
        const shock   = scr?.shockDuration || 0;
        const mf      = scr?.microFreeze || 0;
        const tLen    = scr?.trajectoryLength || 0;
        const pts     = scr?.pointCount || 0;
        const avgSpd  = scr?.avgSpeed || 0;
        const sd      = scr?.startDelay || 0;
        const ct      = scr?.catchTime || 0;

        // Палец был на экране?
        const fingerOnScreen = pts >= 3;

        // «Замёрзший палец» — много точек, но почти не двигался
        const frozenFinger = fingerOnScreen && tLen < 60 && pts >= 5;

        // Максимум шока = даже не начал двигаться
        const totalParalysis = sd >= 1200 && tLen < 30;

        let panicScore = 55; // база

        if (fingerOnScreen) {
            // У нас есть данные — анализируем ПОЧЕМУ не поймал

            // TIER 1: Полный паралич — 90-100
            if (shock >= 1500 || totalParalysis || (frozenFinger && shock >= 800)) {
                panicScore = 95;
                // Бонус за экстремальные значения
                if (shock >= 1800 && tLen < 20) panicScore = 100;
                else if (shock >= 1700 || (tLen < 10 && pts >= 5)) panicScore = 98;
                details.push(`🔴 ПАРАЛИЧ: shock=${shock}ms, traj=${tLen.toFixed(0)}px, pts=${pts}`);
            }
            // TIER 2: Сильная паника — 80-90
            else if (shock >= 1000 || mf >= 500 || (frozenFinger && shock >= 400)) {
                panicScore = 85;
                if (shock >= 1200) panicScore = 90;
                details.push(`🟠 Сильная паника: shock=${shock}ms, freeze=${mf}ms`);
            }
            // TIER 3: Заметный испуг — 70-80
            else if (shock >= 600 || mf >= 300 || (avgSpd < 100 && tLen < 100)) {
                panicScore = 75;
                if (shock >= 800) panicScore = 80;
                details.push(`🟡 Заметный испуг: shock=${shock}ms, speed=${avgSpd.toFixed(0)}`);
            }
            // TIER 4: Умеренный — 60-70
            else if (shock >= 300 || mf >= 150) {
                panicScore = 65;
                details.push(`Умеренный: shock=${shock}ms, freeze=${mf}ms`);
            }
            // TIER 5: Минимальный шок, но всё же не поймал — 55-60
            else {
                panicScore = 58;
                details.push(`Не поймал: shock=${shock}ms`);
            }

            // Дополнительно: замёрзший палец (перекрывает если выше)
            if (frozenFinger && panicScore < 85) {
                panicScore = Math.max(panicScore, 85);
                details.push(`🧊 Замёрзший палец: ${pts} точек, ${tLen.toFixed(0)}px`);
            }

        } else {
            // Мало данных — палец был поднят или едва коснулся
            // Защита от "просто не играл"
            if (shock >= 1000) {
                // Шок есть, просто убрал палец от страха — тоже страх!
                panicScore = 80;
                details.push(`Убрал палец + шок: shock=${shock}ms`);
            } else if (shock >= 400) {
                panicScore = 65;
                details.push(`Минимум данных, есть шок: shock=${shock}ms`);
            } else {
                // Нет шока, нет движения → скорее ленивый / запутался
                panicScore = 55;
                details.push('Мало данных, нет шока → base 55');
            }
        }

        // Post degradation
        const baseCT = avgPre.catchTime > 100 ? avgPre.catchTime : 700;
        if (avgPost.catchTime > baseCT * 1.05) {
            panicScore += 5;
            details.push('PostDeg: +5');
        }

        return { score: Math.min(100, panicScore), details };
    }

    // =============================================================
    // CAUGHT — поймал сердце после скримера
    // =============================================================

    // === BASELINE ===
    const mid = avgMid && avgMid.catchTime > 100 ? avgMid : null;
    function bestBase(key) {
        const p = avgPre[key] || 0;
        const m = mid ? (mid[key] || 0) : 0;
        return Math.max(p, m) || p;
    }

    const baseRecoil   = bestBase('recoilDistance');
    const baseJerk     = bestBase('totalJerk');
    const baseCatch    = bestBase('catchTime');
    const baseSV       = bestBase('speedVariability');
    const baseTraj     = bestBase('trajectoryLength');
    const baseSin      = bestBase('sinuosity');

    const catchRatio   = baseCatch > 0 ? scr.catchTime / baseCatch : 1;
    const svRatio      = baseSV > 0    ? scr.speedVariability / baseSV : 1;
    const jerkRatio    = baseJerk > 0  ? scr.totalJerk / baseJerk : 1;
    const recoilRatio  = baseRecoil > 0 ? scr.recoilDistance / baseRecoil : 1;

    // === DETECT RESPONSE PATTERN ===
    const shock = scr.shockDuration || 0;
    const isFreezeResponse =
        scr.microFreeze > 250 ||
        (catchRatio > 1.2 && svRatio < 0.7) ||
        shock > 400;

    // =============================================================
    // TIER 1 — Доказанные метрики (max ~56)
    // =============================================================

    // 1. ShockDuration — логарифмический, capped 700ms (max 18)
    if (shock > 150) {
        const capped = Math.min(shock, 700);
        const p = Math.min(18, Math.round(
            18 * Math.log1p((capped - 150) / 100) / Math.log1p(5.5)
        ));
        score += p;
        details.push(`ShockDur(${shock}ms→${capped}): +${p}`);
    }

    // 2. Recoil vs best baseline (max 18)
    if (baseRecoil > 0) {
        if (recoilRatio > 1.1) {
            const p = Math.min(18, Math.round((recoilRatio - 1) * 35));
            score += p;
            details.push(`Recoil(${Math.round(scr.recoilDistance)} vs ${Math.round(baseRecoil)}, x${recoilRatio.toFixed(2)}): +${p}`);
        }
    } else if (scr.recoilDistance > 300) {
        score += 8;
        details.push(`RecoilAbs(${Math.round(scr.recoilDistance)}px): +8`);
    }

    // 3. TotalJerk — relative + absolute (combined max 16)
    {
        let jp = 0;
        if (baseJerk > 0 && jerkRatio > 1.15) {
            jp += Math.min(14, Math.round((jerkRatio - 1) * 25));
            details.push(`Jerk(x${jerkRatio.toFixed(2)}): +${Math.min(14, jp)}`);
        }
        if (scr.totalJerk > 7500) {
            const abs = Math.min(6, Math.round((scr.totalJerk - 7500) / 800));
            jp += abs;
            details.push(`JerkAbs(${Math.round(scr.totalJerk)}): +${abs}`);
        }
        score += Math.min(16, jp);
    }

    // 4. 🧊 FREEZE DETECTOR v2 (max 25)
    if (isFreezeResponse) {
        let fp = 0;

        if (scr.microFreeze > 100) {
            const dur = Math.min(scr.microFreeze, 800);
            fp += Math.min(16, Math.round(
                16 * Math.log1p((dur - 100) / 80) / Math.log1p(8.75)
            ));
        }

        if (catchRatio > 1.05) {
            fp += Math.min(8, Math.round((catchRatio - 1) * 25));
        }

        if (svRatio < 0.85) {
            fp += Math.min(5, Math.round((1 - svRatio) * 15));
        }

        if (scr.catchTime > 900) {
            fp += Math.min(5, Math.round((scr.catchTime - 900) / 100));
        }

        const p = Math.min(25, fp);
        if (p > 0) {
            score += p;
            details.push(`🧊Freeze(mf=${scr.microFreeze}ms, ctR=${catchRatio.toFixed(2)}, svR=${svRatio.toFixed(2)}): +${p}`);
        }
    }

    // =============================================================
    // TIER 2 — Дополнительные (max ~23)
    // =============================================================

    // 5. CatchTime adrenaline/slowdown (max 10)
    if (catchRatio < 0.85) {
        const p = Math.min(10, Math.round((1 - catchRatio) * 50));
        score += p;
        details.push(`Adrenaline(x${catchRatio.toFixed(2)}): +${p}`);
    } else if (catchRatio > 1.1 && !isFreezeResponse) {
        const p = Math.min(10, Math.round((catchRatio - 1) * 25));
        score += p;
        details.push(`Slowdown(x${catchRatio.toFixed(2)}): +${p}`);
    }

    // 6. TrajectoryLength (max 8)
    if (baseTraj > 0) {
        const ratio = scr.trajectoryLength / baseTraj;
        if (ratio > 1.15) {
            const p = Math.min(8, Math.round((ratio - 1) * 20));
            score += p;
            details.push(`TrajLen(x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // 7. Sinuosity (max 5)
    if (scr.sinuosity > 1.02 && baseSin > 0) {
        const ratio = scr.sinuosity / baseSin;
        if (ratio > 1.15) {
            const p = Math.min(5, Math.round((ratio - 1) * 15));
            score += p;
            details.push(`Sinuosity(x${ratio.toFixed(2)}): +${p}`);
        }
    }

    // =============================================================
    // TIER 3 — Тонкие метрики (max ~20)
    // =============================================================

    // 8. SpeedVariability (max 5, только non-freeze)
    if (!isFreezeResponse && baseSV > 0 && scr.speedVariability > baseSV * 1.15) {
        const p = Math.min(5, Math.round((scr.speedVariability / baseSV - 1) * 12));
        score += p;
        details.push(`SpeedVar: +${p}`);
    }

    // 9. MicroFreeze (max 4, только non-freeze)
    if (!isFreezeResponse && scr.microFreeze > 100) {
        const p = Math.min(4, Math.round(scr.microFreeze / 80));
        score += p;
        details.push(`MicroFreeze(${scr.microFreeze}ms): +${p}`);
    }

    // 10. Contact area (max 6)
    if (scr.contactAreaDelta > 500) {
        const p = Math.min(6, Math.round(scr.contactAreaDelta / 350));
        score += p;
        details.push(`Contact: +${p}`);
    }

    // 11. Force (max 5)
    if (scr.forceDelta > 0.02 && avgPre.forceAvg > 0) {
        const p = Math.min(5, Math.round(scr.forceDelta / 0.012));
        score += p;
        details.push(`Force: +${p}`);
    }

    // 12. Real vs Fake (max 8)
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

    // 13. Post degradation (5)
    if (avgPost.catchTime > baseCatch * 1.05) {
        score += 5;
        details.push('PostDeg: +5');
    }

    // 14. Flinch (max 8)
    if (scr.startDelay < 120 && scr.directionError > 18) {
        const p = Math.min(8, Math.round(scr.directionError / 4));
        score += p;
        details.push(`Flinch(sd=${Math.round(scr.startDelay)}, de=${scr.directionError.toFixed(1)}): +${p}`);
    }

    // =============================================================
    // FLOOR — freeze-ответы не ниже 20
    // =============================================================
    if (isFreezeResponse && score < 20) {
        const boost = 20 - score;
        score += boost;
        details.push(`FreezeFloor(+${boost})`);
    }

    return { score: Math.min(100, Math.max(0, Math.round(score))), details };
}

function _dist(x1, y1, x2, y2) {
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}
