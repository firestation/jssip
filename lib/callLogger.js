// Журнал живёт только в браузере: никуда не отправляется (сетевых запросов
// нет). Копируется в буфер и скачивается файлом по Alt+L.
// Тайминги считаются от старта звонка, чтобы было видно, где пауза.
let current = null;

function newCallId()
{
	const rand = 1000 + Math.floor(Math.random() * 9000);

	return `c${Date.now().toString(36)}${rand}`;
}

function elapsed()
{
	return current ? Date.now() - current.t0 : null;
}

const callLogger =
{
	start(context)
	{
		this.open();

		current =
		{
			id : newCallId(),
			t0 : Date.now()
		};

		this.log('call_start', context);

		return current.id;
	},

	// Подтягивает сохранённые записи один раз
	open()
	{
		if (this._loaded)
			return;

		this._loaded = true;

		// При каждой загрузке страницы журнал начинается с чистого листа:
		// иначе после обновления в нём лежат записи прошлой сессии и путают.
		try
		{
			sessionStorage.removeItem('jssip_call_log');
		}
		catch (error) {}
	},

	// Убирает только метки качества из журнала (по кнопке «Очистить»)
	clearQuality()
	{
		this.entries = (this.entries || []).filter((entry) =>
			!/^quality/.test(entry.event));

		persist();
	},

	// Полная очистка журнала
	clear()
	{
		this.entries.length = 0;
		this._loaded = true;

		try
		{
			sessionStorage.removeItem('jssip_call_log');
		}
		catch (error) {}
	},

	log(event, data)
	{
		if (!current)
			return;

		const payload = Object.assign({ ms: elapsed() }, data || {});
		const entry =
		{
			ms   : payload.ms,
			event,
			data : data || {}
		};

		this.entries.push(entry);
		persist();
		/* eslint-disable no-console */
		console.info(`[call ${current.id}] +${entry.ms} мс ${event}`, data || {});
		/* eslint-enable no-console */
	},

	// Запасной путь: события без начатого звонка (регистрация, транспорт).
	// Тоже кладём в общий журнал — иначе в консоли видно только звонки.
	logSession(event, id, data)
	{
		this.open();

		const ms = elapsed() === null ? '-' : `${elapsed()} мс`;

		this.entries.push({ at: new Date(), ms: elapsed(), event, data: data || {} });
		persist();
		/* eslint-disable no-console */
		console.info(`[sip] +${ms} ${event}`, data || {});
		/* eslint-enable no-console */
	},

	// Отсчёт времени для событий без исходящего звонка (входящие)
	startSessionWatch(originator)
	{
		if (current)
			return;

		current =
		{
			id         : newCallId(),
			t0         : Date.now(),
			originator : originator || 'remote'
		};
	},

	// Подписывает сессию на метки, даже если звонок начат не кнопкой
	watch(session)
	{
		if (!session || session._callLoggerWatched)
			return;

		session._callLoggerWatched = true;

		session.on('sdp', () =>
		{
			this.logSession('sdp_ready', null, {});
		});

		session.on('sending', (data) =>
		{
			const method = data && data.request ? data.request.method : '?';

			this.logSession('sending', null, { method });
		});
	},

	currentId()
	{
		return current ? current.id : null;
	},

	end(cause)
	{
		if (!current)
			return;

		this.log('call_end', cause ? { cause } : {});
		current = null;
	}
};

// Журнал переживает перезагрузку вкладки (sessionStorage), чтобы не терялся
// при случайном F5 после звонка
function persist()
{
	try
	{
		sessionStorage.setItem('jssip_call_log', JSON.stringify(callLogger.entries.slice(-500)));
	}
	catch (error) {}
}

// Всё, что собрано за звонок, доступно в консоли:
//   console.table(callLogger.entries())
//   copy(callLogger.asText())      — скопировать как текст
//   callLogger.download()          — скачать файлом
callLogger.entries = [];
callLogger._loaded = false;
callLogger.asText = function()
{
	const started = new Date(performance.timing ?
		performance.timing.navigationStart : Date.now());
	const header = `Журнал с ${started.toISOString()}\n`
		+ 'Время (UTC)        | +мс от звонка | событие                | данные';

	return [ header ].concat(this.entries.map((entry) =>
	{
		const at = entry.at instanceof Date ? entry.at : new Date(entry.at || 0);
		const time = at.toISOString().substring(11, 23);
		const ms = entry.ms === null || entry.ms === undefined ? '-' : String(entry.ms);

		return `${time} | ${ms.padStart(13)} | ${entry.event.padEnd(22)} | ${JSON.stringify(entry.data)}`;
	})).join('\n');
};
callLogger.download = function()
{
	const blob = new Blob([ this.asText() ], { type: 'text/plain' });
	const link = document.createElement('a');

	link.href = URL.createObjectURL(blob);
	link.download = `sip-log-${Date.now()}.txt`;
	link.click();
};

// Журнал открываем при загрузке страницы: пользователь должен увидеть
// прошлые записи (в т.ч. если только что перезагрузил вкладку)
// Горячая клавиша: Alt+L — скопировать журнал в буфер и скачать файлом.
// Не нужно лезть в консоль, работает и при «просто позвонил».
if (typeof document !== 'undefined')
{
	document.addEventListener('keydown', (event) =>
	{
		if (!event.altKey || String(event.key).toLowerCase() !== 'l')
			return;

		const text = callLogger.asText();

		try
		{
			navigator.clipboard.writeText(text);
		}
		catch (error)
		{
			/* eslint-disable no-console */
			console.warn('журнал не скопирован, скачиваю файлом');
			/* eslint-enable no-console */
		}

		callLogger.download();

		/* eslint-disable no-alert */
		alert(`Журнал звонков: ${callLogger.entries.length} записей.\n` +
			'Скопирован в буфер и сохранён файлом.');
		/* eslint-enable no-alert */
	});
}

callLogger.open();

window.callLogger = callLogger;

export default callLogger;
