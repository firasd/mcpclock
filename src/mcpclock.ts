import { alphadec } from "./lib/alphadec.js";

export interface ClockGetOptions {
	timezones?: string[];
	offsetSeconds?: number;
}

export type ClockEntry =
	| { timezone: "UTC"; iso: string; unixtime: number }
	| { timezone: "Alphadec"; alphadec: string; alphadec_info?: string }
	| {
			timezone: string;
			time12: string;
			time24: string;
			dayName: string;
			date: string;
			tz_abbrev: string | undefined;
			utc_offset: string | undefined;
	  };

export interface ClockDayInfoOptions {
	date?: string;
}

export interface ClockConvertOptions {
	source_zone: string;
	iso: string;
	target_zones: string[];
}

export interface ClockConvertAlphadecOptions {
	direction?: "utc_to_alphadec" | "alphadec_to_utc";
	value: string;
}

export interface ClockConvertUnixtimeOptions {
	direction?: "utc_to_unixtime" | "unixtime_to_utc";
	value: string;
}

export interface UtcDelta {
	years?: number;
	days?: number;
	hours?: number;
	minutes?: number;
	seconds?: number;
}

export interface ClockShiftUtcOptions {
	date_from: string;
	direction?: "after" | "before";
	delta?: UtcDelta;
}

export interface ClockDeltaUtcOptions {
	start?: string;
	end?: string;
}

export interface ClockOffsetUtcOptions {
	moment_a?: string;
	target:
		| { type: "moment"; moment_b: string }
		| { type: "duration"; direction?: "after" | "before"; duration: UtcDelta };
}

/** Supply a second instant or a duration; return both instants and their difference. */
export function clockOffsetUtc({ moment_a, target }: ClockOffsetUtcOptions) {
	const now = new Date().toISOString();
	const resolveMoment = (value: string): string => {
		if (value === "NOW") return now;
		if (
			typeof value !== "string" ||
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/.test(value)
		) {
			throw new Error('Expected a UTC ISO timestamp ending in Z, or "NOW".');
		}
		const date = new Date(value);
		if (
			!Number.isFinite(date.getTime()) ||
			date.toISOString().slice(0, 10) !== value.slice(0, 10)
		) {
			throw new Error(`Invalid UTC instant: ${value}`);
		}
		return date.toISOString();
	};
	const a = resolveMoment(moment_a ?? "NOW");
	let b: string;
	if (target?.type === "moment") {
		if ("duration" in target || "direction" in target)
			throw new Error("Supply either a moment or a duration, not both.");
		b = resolveMoment(target.moment_b);
	} else if (target?.type === "duration") {
		if ("moment_b" in target)
			throw new Error("Supply either a moment or a duration, not both.");
		if (
			!target.duration ||
			typeof target.duration !== "object" ||
			Array.isArray(target.duration)
		)
			throw new Error("duration must be an object.");
		if ((target.duration.years ?? 0) > 9999)
			throw new Error(
				"Calendar-year shift is outside the supported year range (0000-9999).",
			);
		b = clockShiftUtc({
			date_from: a,
			direction: target.direction,
			delta: target.duration,
		}).shifted_utc_iso;
		b = resolveMoment(b);
	} else {
		throw new Error('target.type must be "moment" or "duration".');
	}
	const difference = clockDeltaUtc({ start: a, end: b });
	return {
		moment_a: a,
		moment_b: b,
		total_seconds: difference.total_seconds,
		breakdown: difference.breakdown,
		readable: difference.readable,
	};
}

export interface ClockDeltaAlphadecOptions {
	alphadec_start?: string;
	alphadec_end?: string;
}

const isValidIANATimeZone = (tz: string): boolean => {
	if (!tz || typeof tz !== "string" || tz.length < 2) return false;
	try {
		new Intl.DateTimeFormat(undefined, {
			timeZone: tz,
		});
		return true;
	} catch (_) {
		return false;
	}
};

function validateInteger(
	value: number | undefined,
	name: string,
	nonnegative = false,
) {
	if (
		value !== undefined &&
		(!Number.isSafeInteger(value) || (nonnegative && value < 0))
	) {
		throw new Error(
			`${name} must be a ${nonnegative ? "non-negative " : ""}safe integer.`,
		);
	}
}

function validateZones(zones: string[], name: string, minimum: number) {
	if (
		!Array.isArray(zones) ||
		zones.length < minimum ||
		zones.length > 15 ||
		zones.some((zone) => typeof zone !== "string")
	) {
		throw new Error(
			`${name} must be an array of ${minimum} to 15 timezone strings.`,
		);
	}
}

/** Current time in the requested zones, always including UTC and Alphadec. */
export function clockGet({
	timezones,
	offsetSeconds,
}: ClockGetOptions = {}): ClockEntry[] {
	if (timezones !== undefined) validateZones(timezones, "timezones", 0);
	validateInteger(offsetSeconds, "offsetSeconds");
	const base = new Date();
	const target = offsetSeconds
		? new Date(base.getTime() + offsetSeconds * 1000)
		: base;
	const AlphadecData = alphadec.encode(target);
	const requestedZones = timezones?.length ? timezones : ["UTC"];
	const isPseudo = (tz: string) => tz === "UTC" || tz === "Alphadec";
	for (const tz of requestedZones) {
		if (!isPseudo(tz) && !isValidIANATimeZone(tz)) {
			throw new Error(`Invalid timezone: ${tz}`);
		}
	}
	const entries: ClockEntry[] = [];
	for (const tz of requestedZones) {
		if (tz === "Alphadec") continue;
		if (tz === "UTC" && !entries.some((e) => e.timezone === "UTC")) {
			entries.push({
				timezone: "UTC",
				iso: target.toISOString(),
				unixtime: Math.floor(target.getTime() / 1000),
			});
			continue;
		}
		if (tz !== "UTC") {
			const tzParts = new Intl.DateTimeFormat("en-US", {
				timeZone: tz,
				timeZoneName: "short",
			}).formatToParts(target);
			const offsetParts = new Intl.DateTimeFormat("en-US", {
				timeZone: tz,
				timeZoneName: "shortOffset",
			}).formatToParts(target);
			const tzAbbrev = tzParts.find((p) => p.type === "timeZoneName")?.value;
			const utcOffset = offsetParts.find(
				(p) => p.type === "timeZoneName",
			)?.value;
			entries.push({
				timezone: tz,
				time12: new Intl.DateTimeFormat("en-US", {
					hour: "numeric",
					minute: "numeric",
					hour12: true,
					timeZone: tz,
				}).format(target),
				time24: new Intl.DateTimeFormat("en-US", {
					hour: "numeric",
					minute: "numeric",
					hour12: false,
					timeZone: tz,
				}).format(target),
				dayName: new Intl.DateTimeFormat("en-US", {
					weekday: "long",
					timeZone: tz,
				}).format(target),
				date: new Intl.DateTimeFormat("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
					timeZone: tz,
				}).format(target),
				tz_abbrev: tzAbbrev,
				utc_offset: utcOffset,
			});
		}
	}
	if (!entries.some((e) => e.timezone === "UTC")) {
		entries.push({
			timezone: "UTC",
			iso: target.toISOString(),
			unixtime: Math.floor(target.getTime() / 1000),
		});
	}
	entries.push({
		timezone: "Alphadec",
		alphadec: AlphadecData.canonical,
		...(requestedZones.includes("Alphadec")
			? {
					alphadec_info:
						"Alphadec units (approx): Period (A-Z) ≈ 14.04 days (UTC yr / 26) | Arc (0-9) ≈ 33.7 hours (Period / 10) | Bar (A-Z) ≈ 77.75 minutes (Arc / 26) | Beat (0-9) ≈ 7.78 minutes (Bar / 10). Suffix is ms offset within the beat.",
				}
			: {}),
	});
	return entries;
}

/** Calendar details for a UTC date, including tabular and Umm al-Qura Hijri dates. */
export function clockDayInfo({ date }: ClockDayInfoOptions = {}) {
	if (
		date !== undefined &&
		(typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
	) {
		throw new Error("date must be in YYYY-MM-DD format.");
	}
	const toUTCDateStr = (d: Date) => {
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, "0");
		const da = String(d.getUTCDate()).padStart(2, "0");
		return `${y}-${m}-${da}`;
	};
	const resolvedDate = date ?? toUTCDateStr(new Date());
	const dateObj = new Date(resolvedDate + "T00:00:00.000Z");
	const year = dateObj.getUTCFullYear();
	const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	const daysInYear = isLeapYear ? 366 : 365;
	const startOfYear = new Date(Date.UTC(year, 0, 1));
	const dayOfYear =
		Math.floor(
			(dateObj.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24),
		) + 1;
	const yearProgress = Math.round((dayOfYear / daysInYear) * 100);
	const weekdayName = new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		timeZone: "UTC",
	}).format(dateObj);
	const tempDate = new Date(dateObj);
	const dayOfWeek = (tempDate.getUTCDay() + 6) % 7;
	tempDate.setUTCDate(tempDate.getUTCDate() - dayOfWeek + 3);
	const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 4));
	const yearStartDay = (yearStart.getUTCDay() + 6) % 7;
	yearStart.setUTCDate(yearStart.getUTCDate() - yearStartDay + 3);
	const isoWeek =
		Math.floor(
			(tempDate.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
		) + 1;
	const daysInMonth = new Date(
		Date.UTC(year, dateObj.getUTCMonth() + 1, 0),
	).getUTCDate();
	const formatHijriDate = (calendar: string) =>
		new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`, {
			timeZone: "UTC",
			year: "numeric",
			month: "long",
			day: "numeric",
		}).format(dateObj);
	return {
		date: resolvedDate,
		weekday: weekdayName,
		days_in_month: daysInMonth,
		day_of_year: dayOfYear,
		days_in_year: daysInYear,
		year_progress_pct: yearProgress,
		iso_week: isoWeek,
		hijri_calendar: {
			tabular: formatHijriDate("islamic-tbla"),
			umm_al_qura: formatHijriDate("islamic-umalqura"),
		},
	};
}

/** Convert a UTC instant or an IANA-zone wall-clock time into target zones. */
export function clockConvert({
	source_zone,
	iso,
	target_zones,
}: ClockConvertOptions) {
	validateZones(target_zones, "target_zones", 1);
	let srcDateUTC: Date;
	if (source_zone !== "UTC" && !isValidIANATimeZone(source_zone)) {
		throw new Error(
			`Invalid source_zone: "${source_zone}". Must be "UTC" or a valid IANA zone name.`,
		);
	}
	if (source_zone === "UTC") {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/.test(iso)) {
			throw new Error(
				`Invalid ISO format for UTC source: "${iso}". Expected YYYY-MM-DDTHH:MM(:SS)(.mmm)Z.`,
			);
		}
		srcDateUTC = new Date(iso);
	} else {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/.test(iso)) {
			throw new Error(
				`Invalid ISO-8601 format for IANA source "${source_zone}": "${iso}". Expected YYYY-MM-DDTHH:MM(:SS)(.mmm) without offset.`,
			);
		}
		const isoTimestamp = iso.replace(" ", "T");
		const term1Ms = Date.parse(isoTimestamp + "Z");
		if (Number.isNaN(term1Ms)) {
			throw new Error(
				`Invalid ISO date/time string for parsing: ${isoTimestamp}`,
			);
		}
		const localTimeInSourceZoneStr = new Date(term1Ms)
			.toLocaleString("sv-SE", {
				timeZone: source_zone,
				hour12: false,
			})
			.replace(" ", "T");
		const term2Ms = Date.parse(localTimeInSourceZoneStr + "Z");
		if (Number.isNaN(term2Ms)) {
			throw new Error(
				`Failed to parse localized time string for zone ${source_zone}: ${localTimeInSourceZoneStr}`,
			);
		}
		srcDateUTC = new Date(2 * term1Ms - term2Ms);
	}
	if (Number.isNaN(srcDateUTC.getTime())) {
		throw new Error(
			`Could not determine a valid UTC date from source: ${source_zone}, iso: ${iso}`,
		);
	}
	for (const tz of target_zones) {
		if (tz !== "UTC" && !isValidIANATimeZone(tz)) {
			throw new Error(
				`Invalid target zone: "${tz}". Must be "UTC" or a valid IANA zone name.`,
			);
		}
	}
	const out = target_zones.map((targetZone) => {
		if (targetZone === "UTC") {
			return {
				timezone: "UTC",
				iso: srcDateUTC.toISOString(),
			};
		}
		return {
			timezone: targetZone,
			time12: new Intl.DateTimeFormat("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
				timeZone: targetZone,
			}).format(srcDateUTC),
			time24: new Intl.DateTimeFormat("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false,
				timeZone: targetZone,
			}).format(srcDateUTC),
			dayName: new Intl.DateTimeFormat("en-US", {
				weekday: "long",
				timeZone: targetZone,
			}).format(srcDateUTC),
			date: new Intl.DateTimeFormat("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
				timeZone: targetZone,
			}).format(srcDateUTC),
		};
	});
	return out;
}

/** Convert between UTC ISO timestamps and canonical Alphadec strings. */
export function clockConvertAlphadec({
	direction = "utc_to_alphadec",
	value,
}: ClockConvertAlphadecOptions) {
	if (direction !== "utc_to_alphadec" && direction !== "alphadec_to_utc") {
		throw new Error("Invalid Alphadec conversion direction.");
	}
	if (direction === "utc_to_alphadec") {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/.test(value)) {
			throw new Error(
				`Invalid UTC ISO format for "value": ${value}. Expected YYYY-MM-DDTHH:MM(:SS)(.mmm)Z.`,
			);
		}
		const inputDate = new Date(value);
		if (Number.isNaN(inputDate.getTime())) {
			throw new Error(`Invalid date from UTC ISO string: ${value}`);
		}
		const encodeResult = alphadec.encode(inputDate);
		return {
			source_utc_iso: value,
			alphadec: encodeResult.canonical,
		};
	} else {
		if (!/^\d{4}_[A-Z]\d[A-Z]\d_[0-9]{6}$/.test(value)) {
			throw new Error(
				`Invalid AlphaDec format for "value": ${value}. Expected YYYY_PaBt_MMMMMM.`,
			);
		}
		const decodedDate = alphadec.decode(value);
		if (Number.isNaN(decodedDate.getTime())) {
			throw new Error(`Invalid AlphaDec string or unable to decode: ${value}`);
		}
		return {
			source_alphadec: value,
			utc_iso: decodedDate.toISOString(),
		};
	}
}

/** Convert between UTC ISO timestamps and non-negative Unix seconds. */
export function clockConvertUnixtime({
	direction = "utc_to_unixtime",
	value,
}: ClockConvertUnixtimeOptions) {
	if (direction !== "utc_to_unixtime" && direction !== "unixtime_to_utc") {
		throw new Error("Invalid Unix time conversion direction.");
	}
	if (direction === "utc_to_unixtime") {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(value)) {
			throw new Error(
				`Invalid UTC ISO format for "value": ${value}. Expected YYYY-MM-DDTHH:MM(:SS)Z.`,
			);
		}
		const inputDate = new Date(value);
		if (Number.isNaN(inputDate.getTime())) {
			throw new Error(`Invalid date from UTC ISO string: ${value}`);
		}
		const unixTimestamp = Math.floor(inputDate.getTime() / 1000);
		return {
			source_utc_iso: value,
			unix_timestamp: unixTimestamp,
		};
	} else {
		if (!/^\d+$/.test(value)) {
			throw new Error(
				`Invalid Unix timestamp format for "value": ${value}. Expected positive integer (seconds since epoch).`,
			);
		}
		const unixSeconds = parseInt(value, 10);
		if (Number.isNaN(unixSeconds) || unixSeconds < 0) {
			throw new Error(
				`Invalid Unix timestamp: ${value}. Must be a non-negative integer.`,
			);
		}
		const convertedDate = new Date(unixSeconds * 1000);
		if (Number.isNaN(convertedDate.getTime())) {
			throw new Error(`Invalid Unix timestamp or unable to convert: ${value}`);
		}
		return {
			source_unix_timestamp: unixSeconds,
			utc_iso: convertedDate.toISOString(),
		};
	}
}

/** Apply calendar years one at a time, then fixed UTC days and smaller units. */
export function clockShiftUtc({
	date_from,
	direction = "after",
	delta,
}: ClockShiftUtcOptions) {
	if (direction !== "after" && direction !== "before") {
		throw new Error('direction must be "after" or "before".');
	}
	if (
		delta !== undefined &&
		(delta === null || typeof delta !== "object" || Array.isArray(delta))
	) {
		throw new Error("delta must be an object.");
	}
	for (const unit of [
		"years",
		"days",
		"hours",
		"minutes",
		"seconds",
	] as const) {
		validateInteger(delta?.[unit], `delta.${unit}`, true);
	}
	const now = new Date();
	let resolvedMoment: string;
	if (date_from === "NOW") {
		resolvedMoment = now.toISOString().slice(0, 19) + "Z";
	} else {
		const ISO_UTC_SECONDS_RE =
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/;
		if (!ISO_UTC_SECONDS_RE.test(date_from)) {
			throw new Error(
				`Invalid date_from: "${date_from}". Expected "NOW" or YYYY-MM-DDTHH:MM:SSZ.`,
			);
		}
		resolvedMoment = date_from;
	}
	const resolvedDirection = direction || "after";
	const sourceDate = new Date(resolvedMoment);
	if (Number.isNaN(sourceDate.getTime())) {
		throw new Error(`Invalid date_from date: ${resolvedMoment}`);
	}
	const years = delta?.years ?? 0;
	const days = delta?.days ?? 0;
	const hours = delta?.hours ?? 0;
	const minutes = delta?.minutes ?? 0;
	const seconds = delta?.seconds ?? 0;
	const sign = resolvedDirection === "before" ? -1 : 1;
	const shifted = new Date(sourceDate);
	for (let i = 0; i < years; i++) {
		shifted.setUTCFullYear(shifted.getUTCFullYear() + sign);
	}
	const MS_DAY = 1000 * 60 * 60 * 24;
	const MS_HOUR = 1000 * 60 * 60;
	const MS_MIN = 1000 * 60;
	const smallerUnitMs =
		days * MS_DAY + hours * MS_HOUR + minutes * MS_MIN + seconds * 1000;
	shifted.setTime(shifted.getTime() + sign * smallerUnitMs);
	let remainingSeconds =
		days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds;
	const normalizedDays = Math.floor(remainingSeconds / (24 * 60 * 60));
	remainingSeconds %= 24 * 60 * 60;
	const normalizedHours = Math.floor(remainingSeconds / (60 * 60));
	remainingSeconds %= 60 * 60;
	const normalizedMinutes = Math.floor(remainingSeconds / 60);
	const normalizedSeconds = remainingSeconds % 60;
	return {
		source_utc_iso: sourceDate.toISOString(),
		date_from_was_now: date_from === "NOW",
		direction: resolvedDirection,
		input_delta: {
			years,
			days,
			hours,
			minutes,
			seconds,
		},
		normalized_delta: {
			years,
			days: normalizedDays,
			hours: normalizedHours,
			minutes: normalizedMinutes,
			seconds: normalizedSeconds,
		},
		shifted_utc_iso: shifted.toISOString(),
		total_seconds_excluding_calendar_years:
			sign * (days * 86400 + hours * 3600 + minutes * 60 + seconds),
	};
}

/** Signed elapsed seconds and a calendar-year-aware breakdown between UTC instants. */
export function clockDeltaUtc({ start, end }: ClockDeltaUtcOptions) {
	if (!start && !end) {
		throw new Error("At least one of 'start' or 'end' must be provided.");
	}
	const now = new Date();
	const nowStr = now.toISOString().slice(0, 19) + "Z";
	const resolvedStart = start || nowStr;
	const resolvedEnd = end || nowStr;
	const ISO_UTC_SECONDS_RE =
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/;
	if (!ISO_UTC_SECONDS_RE.test(resolvedStart)) {
		throw new Error(`Invalid start UTC ISO format: ${resolvedStart}.`);
	}
	if (!ISO_UTC_SECONDS_RE.test(resolvedEnd)) {
		throw new Error(`Invalid end UTC ISO format: ${resolvedEnd}.`);
	}
	const startDate = new Date(resolvedStart);
	const endDate = new Date(resolvedEnd);
	if (Number.isNaN(startDate.getTime())) {
		throw new Error(`Invalid start date: ${resolvedStart}`);
	}
	if (Number.isNaN(endDate.getTime())) {
		throw new Error(`Invalid end date: ${resolvedEnd}`);
	}
	const totalMs = endDate.getTime() - startDate.getTime();
	const sign = totalMs < 0 ? -1 : 1;
	const earlierDate = sign === 1 ? startDate : endDate;
	const laterDate = sign === 1 ? endDate : startDate;
	let years = 0;
	let cursor = new Date(earlierDate);
	while (true) {
		const next = new Date(cursor);
		next.setUTCFullYear(next.getUTCFullYear() + 1);
		if (next.getTime() <= laterDate.getTime()) {
			years++;
			cursor = next;
		} else {
			break;
		}
	}
	let remainingMs = laterDate.getTime() - cursor.getTime();
	const MS_DAY = 1000 * 60 * 60 * 24;
	const MS_HOUR = 1000 * 60 * 60;
	const MS_MIN = 1000 * 60;
	const days = Math.floor(remainingMs / MS_DAY);
	remainingMs %= MS_DAY;
	const hours = Math.floor(remainingMs / MS_HOUR);
	remainingMs %= MS_HOUR;
	const minutes = Math.floor(remainingMs / MS_MIN);
	remainingMs %= MS_MIN;
	const seconds = Math.floor(remainingMs / 1000);
	const parts: string[] = [];
	if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
	if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
	if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
	if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
	if (seconds > 0 || parts.length === 0)
		parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
	const readablePrefix = sign < 0 ? "Negative difference of " : "";
	const readable = readablePrefix + parts.join(", ");
	return {
		start_utc_iso: resolvedStart,
		end_utc_iso: resolvedEnd,
		total_seconds: Math.floor(totalMs / 1000),
		breakdown: {
			years,
			days,
			hours,
			minutes,
			seconds,
		},
		readable,
	};
}

/** Difference between four-character Alphadec codes within the current UTC year. */
export function clockDeltaAlphadec({
	alphadec_start,
	alphadec_end,
}: ClockDeltaAlphadecOptions) {
	for (const code of [alphadec_start, alphadec_end]) {
		if (
			code !== undefined &&
			(typeof code !== "string" || !/^[A-Z]\d[A-Z]\d$/.test(code))
		) {
			throw new Error("Must be a valid 4-character AlphaDec code, e.g., A2B3.");
		}
	}
	if (!alphadec_start && !alphadec_end) {
		throw new Error(
			"At least one of 'alphadec_start' or 'alphadec_end' must be provided.",
		);
	}
	const now = new Date();
	const currentYear = now.getUTCFullYear();
	const getCurrentAlphadecCode = (): string => {
		const canonicalNow = alphadec.encode(now).canonical;
		return canonicalNow.substring(5, 9);
	};
	const resolved_start_code = alphadec_start || getCurrentAlphadecCode();
	const resolved_end_code = alphadec_end || getCurrentAlphadecCode();
	const full_start = `${currentYear}_${resolved_start_code}_000000`;
	const full_end = `${currentYear}_${resolved_end_code}_000000`;
	const date_start = alphadec.decode(full_start);
	const date_end = alphadec.decode(full_end);
	const iso_utc_start = date_start.toISOString();
	const iso_utc_end = date_end.toISOString();
	if (Number.isNaN(date_start.getTime()) || Number.isNaN(date_end.getTime())) {
		throw new Error(
			"Failed to decode one or both AlphaDec codes for the current year.",
		);
	}
	const delta_ms = date_end.getTime() - date_start.getTime();
	const sign = delta_ms < 0 ? "-" : "";
	let total_seconds = Math.abs(delta_ms) / 1000;
	const hours = Math.floor(total_seconds / 3600);
	total_seconds %= 3600;
	const minutes = Math.floor(total_seconds / 60);
	const seconds = Math.floor(total_seconds % 60);
	const iso_delta = `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	const beats_in_arc = 260;
	const beats_in_period = 2600;
	const alphadecToBeats = (code: string): number => {
		const [p_char, a_char, b_char, t_char] = code;
		const p_idx = p_char.charCodeAt(0) - 65;
		const a_val = parseInt(a_char, 10);
		const b_idx = b_char.charCodeAt(0) - 65;
		const t_val = parseInt(t_char, 10);
		return p_idx * beats_in_period + a_val * beats_in_arc + b_idx * 10 + t_val;
	};
	const delta_beats =
		alphadecToBeats(resolved_end_code) - alphadecToBeats(resolved_start_code);
	const adec_sign = delta_beats < 0 ? "-" : "";
	let remaining = Math.abs(delta_beats);
	const periods = Math.floor(remaining / beats_in_period);
	remaining %= beats_in_period;
	const arcs = Math.floor(remaining / beats_in_arc);
	remaining %= beats_in_arc;
	const bars = Math.floor(remaining / 10);
	const beats = remaining % 10;
	const alphadec_delta = `${adec_sign}${String(periods).padStart(2, "0")}:${String(arcs).padStart(2, "0")}:${String(bars).padStart(2, "0")}:${String(beats).padStart(2, "0")}`;
	const breakdown =
		delta_beats < 0
			? `Negative difference of ${periods} period(s), ${arcs} arc(s), ${bars} bar(s), ${beats} beat(s)`
			: `${periods} period(s), ${arcs} arc(s), ${bars} bar(s), ${beats} beat(s)`;
	return {
		alphadec_start: resolved_start_code,
		alphadec_end: resolved_end_code,
		iso_utc_start,
		iso_utc_end,
		iso_time_difference: iso_delta,
		alphadec_unit_delta: alphadec_delta,
		breakdown: breakdown,
	};
}
