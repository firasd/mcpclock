export const alphadec = {
		_SCALER_N: 1_000_000n,

		_toBase26(n) {
			if (n < 0 || n > 25) throw new Error("Invalid index for Base26.");
			return String.fromCharCode(65 + n);
		},

		encode(d) {
			const y = d.getUTCFullYear();
			const isLeap = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0);
			const daysInYear = isLeap ? 366 : 365;

			const BEATS_IN_YEAR = 67600n;
			const yearTotalMs = BigInt(daysInYear) * 86_400_000n;
			const msSinceYearStart = BigInt(d.getTime() - Date.UTC(y, 0, 1));
			
			const scaledBeatProgress = (msSinceYearStart * BEATS_IN_YEAR * this._SCALER_N) / yearTotalMs;

			const totalBeatIndex = (msSinceYearStart * BEATS_IN_YEAR) / yearTotalMs;

			const beatStartScaledMs = (yearTotalMs * totalBeatIndex * this._SCALER_N) / BEATS_IN_YEAR;

			const totalScaledMs = msSinceYearStart * this._SCALER_N;

			const scaledMsOffset = totalScaledMs - beatStartScaledMs;
			const msOffsetInBeat = Number(scaledMsOffset / this._SCALER_N);

			let remainingBeats = totalBeatIndex;
			const p_idx = remainingBeats / 2600n;
			remainingBeats %= 2600n;
			const a_val = remainingBeats / 260n;
			remainingBeats %= 260n;
			const b_idx = remainingBeats / 10n;
			const t_val = remainingBeats % 10n;

			const currentArcStartBeats = (p_idx * 2600n) + (a_val * 260n);
			const arcStartScaledMs = (yearTotalMs * currentArcStartBeats * this._SCALER_N) / BEATS_IN_YEAR;
			const arcEndScaledMs = (yearTotalMs * (currentArcStartBeats + 260n) * this._SCALER_N) / BEATS_IN_YEAR;

			const arcStartMsInYear = Number(arcStartScaledMs / this._SCALER_N);
			const arcEndMsInYear = Number(arcEndScaledMs / this._SCALER_N);

			const periodLetter = this._toBase26(Number(p_idx));
			const barLetter = this._toBase26(Number(b_idx));
			const canonicalMsPart = String(msOffsetInBeat).padStart(6, "0");

			const canonical = `${y}_${periodLetter}${a_val}${barLetter}${t_val}_${canonicalMsPart}`;
			const readable = `${periodLetter}${a_val}:${barLetter}${t_val}`;
			
			return {
				canonical,
				year: y,
				period: Number(p_idx),
				arc: Number(a_val),
				bar: Number(b_idx),
				beat: Number(t_val),
				msOffsetInBeat: Number(msOffsetInBeat),
				periodLetter,
				barLetter,
				readable,
				arcStartMsInYear,
				arcEndMsInYear
			};
		},

		decode(canon) {
			const m = canon.match(/^(\d{4})_([A-Z])(\d)([A-Z])(\d)_([0-9]{6})$/);
			if (!m) throw new Error(`Bad AlphaDec canonical string: "${canon}"`);

			const [, yStr, pLtr, aStr, bLtr, tStr, msStr] = m;
			const year = Number(yStr);

			const isLeap = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0);
			const daysInYear = isLeap ? 366 : 365;

			const BEATS_IN_YEAR = 67600n;
			const yearTotalScaledMs = BigInt(daysInYear) * 86_400_000n * this._SCALER_N;
			const pIndex = BigInt(pLtr.charCodeAt(0) - 65);
			const totalBeats = (pIndex * 2600n) +
				(BigInt(aStr) * 260n) +
				(BigInt(bLtr.charCodeAt(0) - 65) * 10n) +
				BigInt(tStr);

			const beatStartScaledMs = (yearTotalScaledMs * totalBeats) / BEATS_IN_YEAR;
			const totalScaledMs = beatStartScaledMs + (BigInt(msStr) * this._SCALER_N);

			const totalMsSinceYearStart = totalScaledMs / this._SCALER_N;
			const startOfYearMs = Date.UTC(year, 0, 1);

			return new Date(startOfYearMs + Number(totalMsSinceYearStart));
		}
};
