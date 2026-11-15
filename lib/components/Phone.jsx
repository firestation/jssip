import React from 'react';
import PropTypes from 'prop-types';
import CopyToClipboard from 'react-copy-to-clipboard';
import IconMenu from 'material-ui/IconMenu';
import MenuItem from 'material-ui/MenuItem';
import IconButton from 'material-ui/IconButton/IconButton';
import MoreVertIcon from 'material-ui/svg-icons/navigation/more-vert';
import DownloadIcon from 'material-ui/svg-icons/file/file-download';
import JsSIP from 'jssip';
import UrlParse from 'url-parse';
import Logger from '../Logger';
import settingsManager from '../settingsManager';
import callLogger from '../callLogger';
import audioPlayer from '../audioPlayer';
import TransitionAppear from './TransitionAppear';
import Logo from './Logo';
import Dialer from './Dialer';
import Session from './Session';
import Incoming from './Incoming';
import QualityPanel from './QualityPanel';

// TODO: For testing.
window.jssip = JsSIP;

const callstatsjssip = window.callstatsjssip;

const logger = new Logger('Phone');

// Значения по умолчанию для настроек ICE (если в настройках их нет)
// Через сколько после соединения проверяем звук с микрофона и порог тишины
const MIC_SILENCE_THRESHOLD = 0.01;

// Мониторинг качества звонка
const QUALITY_INTERVAL_MS = 6000; // период снятия метрик
const QUALITY_MIC_WINDOW_MS = 3000; // окно замера уровня микрофона
const QUALITY_EXPECTED_PKT = 300; // ожидаемо пакетов за 6 с (~50/с)
const QUALITY_MIN_PKT = 100; // меньше — считаем поток пропавшим
const QUALITY_MAX_LOST = 30; // потерь за интервал
const QUALITY_MAX_JITTER = 0.03; // jitter (секунды)
const QUALITY_MAX_RTT = 400; // RTT в мс

const DEFAULT_ICE_SETTINGS =
{
	releaseOnSrflx : true,
	gatherTimeout  : 4000
};

// JsSIP бросает исключение на instance_id, который не является UUID
function isUuid(value)
{
	return typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default class Phone extends React.Component
{
	constructor(props)
	{
		super(props);

		this.state =
		{
			// 'connecting' / disconnected' / 'connected' / 'registered'
			status          : 'disconnected',
			session         : null,
			incomingSession : null,
			// вкл/выкл аудио и видео для следующего звонка
			media           : this._readMedia(props.settings)
		};

		// Mounted flag
		this._mounted = false;
		// JsSIP.UA instance
		this._ua = null;
		// Site URL
		this._u = new UrlParse(window.location.href, true);
	}

	render()
	{
		const state = this.state;
		const props = this.props;
		const invitationLink = `${this._u.protocol}//${this._u.host}${this._u.pathname}?callme=${props.settings.uri}`;

		return (
			<TransitionAppear duration={1000}>
				<div data-component='Phone'>
					<header>
						<div className='topbar'>
							<Logo
								size='small'
							/>

							<IconButton
								className='download-log-button'
								tooltip='Скачать журнал звонков'
								onClick={this.handleDownloadLog.bind(this)}
							>
								<DownloadIcon color='#fff'/>
							</IconButton>

							<IconMenu
								iconButtonElement={
									<IconButton>
										<MoreVertIcon color='#fff'/>
									</IconButton>
								}
								anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
								targetOrigin={{ horizontal: 'right', vertical: 'top' }}
							>
								<CopyToClipboard text={invitationLink}
									onCopy={this.handleMenuCopyInvitationLink.bind(this)}
								>
									<MenuItem
										primaryText='Copy invitation link'
									/>
								</CopyToClipboard>
								<CopyToClipboard text={props.settings.uri || ''}
									onCopy={this.handleMenuCopyUri.bind(this)}
								>
									<MenuItem
										primaryText='Copy my SIP URI'
									/>
								</CopyToClipboard>
								<MenuItem
									primaryText='Exit'
									onClick={this.handleMenuExit.bind(this)}
								/>
							</IconMenu>
						</div>

						<Dialer
							settings={props.settings}
							media={state.media}
							status={state.status}
							busy={Boolean(state.session || state.incomingSession)}
							callme={this._u.query.callme}
							onCall={this.handleOutgoingCall.bind(this)}
							onMediaChange={this.handleMediaChange.bind(this)}
						/>
					</header>

					<div className='content'>
						<If condition={state.session}>
							<Session
								session={state.session}
								onNotify={props.onNotify}
								onHideNotification={props.onHideNotification}
							/>
						</If>

						<QualityPanel/>

						<If condition={state.incomingSession}>
							<Incoming
								session={state.incomingSession}
								onAnswer={this.handleAnswerIncoming.bind(this)}
								onReject={this.handleRejectIncoming.bind(this)}
							/>
						</If>
					</div>
				</div>
			</TransitionAppear>
		);
	}

	componentDidMount()
	{
		this._mounted = true;

		const settings = this.props.settings;
		const socket = new JsSIP.WebSocketInterface(settings.socket.uri);

		if (settings.socket['via_transport'] !== 'auto')
			socket['via_transport'] = settings.socket['via_transport'];

		try
		{
			this._ua = new JsSIP.UA(
				{
					uri                  : settings.uri,
					password             : settings.password,
					'display_name'       : settings.display_name,
					sockets              : [ socket ],
					'registrar_server'   : settings.registrar_server,
					'contact_uri'        : settings.contact_uri,
					'authorization_user' : settings.authorization_user,
					'instance_id'        : isUuid(settings.instance_id) ?
						settings.instance_id : settingsManager.tabUuid(),
					'session_timers'      : settings.session_timers,
					'use_preloaded_route' : settings.use_preloaded_route
				});

			// TODO: For testing.
			window.UA = this._ua;
		}
		catch (error)
		{
			this.props.onNotify(
				{
					level   : 'error',
					title   : 'Wrong JsSIP.UA settings',
					message : error.message
				});

			this.props.onExit();

			return;
		}

		this._ua.on('connecting', () =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "connecting" event');

			this.setState(
				{
					uri    : this._ua.configuration.uri.toString(),
					status : 'connecting'
				});
		});

		this._ua.on('connected', () =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "connected" event');

			this.setState({ status: 'connected' });
		});

		this._ua.on('disconnected', () =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "disconnected" event');
			callLogger.logSession('ua_disconnected', null, {});

			this.setState({ status: 'disconnected' });
		});

		this._ua.on('registered', () =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "registered" event');
			callLogger.logSession('ua_registered', null, {});

			this.setState({ status: 'registered' });
		});

		this._ua.on('unregistered', () =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "unregistered" event');

			if (this._ua.isConnected())
				this.setState({ status: 'connected' });
			else
				this.setState({ status: 'disconnected' });
		});

		this._ua.on('registrationFailed', (data) =>
		{
			if (!this._mounted)
				return;

			logger.debug('UA "registrationFailed" event');

			if (this._ua.isConnected())
				this.setState({ status: 'connected' });
			else
				this.setState({ status: 'disconnected' });

			this.props.onNotify(
				{
					level   : 'error',
					title   : 'Registration failed',
					message : data.cause
				});
		});

		this._ua.on('newRTCSession', (data) =>
		{
			if (!this._mounted)
				return;

			// TODO: For testing.
			window.SESSION = data.session;

			if (data.originator === 'local')
				return;

			logger.debug('UA "newRTCSession" event');

			callLogger.logSession('new_session', null, { originator: data.originator });

			const state = this.state;
			const session = data.session;

			// Avoid if busy or other incoming
			if (state.session || state.incomingSession)
			{
				logger.debug('incoming call replied with 486 "Busy Here"');

				session.terminate(
					{
						'status_code'   : 486,
						'reason_phrase' : 'Busy Here'
					});

				return;
			}

			this._instrument(session);
			this._guardIce(session);
			this._watchMediaFailure(session);

			audioPlayer.play('ringing');
			this.setState({ incomingSession: session });

			session.on('failed', () =>
			{
				audioPlayer.stop('ringing');
				this.setState(
					{
						session         : null,
						incomingSession : null
					});
			});

			session.on('ended', () =>
			{
				this.setState(
					{
						session         : null,
						incomingSession : null
					});
			});

			session.on('accepted', () =>
			{
				audioPlayer.stop('ringing');
				this.setState(
					{
						session         : session,
						incomingSession : null
					});

				callLogger.log('accepted', { direction: 'incoming' });
				this._logMedia(session, 'incoming');

				// Ждём установления медиа и проверяем микрофон
				this._whenConnected(session, () => this._startQualityMonitor(session));
			});
		});

		this._ua.start();

		// Set callstats stuff
		if (settings.callstats.enabled)
		{
			callstatsjssip(
				// JsSIP.UA instance
				this._ua,
				// AppID
				settings.callstats.AppID,
				// AppSecret
				// 'zAWooDtrYJPo:OeNNdLBBk7nOq9mCS5qbxOhuzt6IdCvnx3cjNGj2tBo='
				settings.callstats.AppSecret
			);
		}
	}

	componentWillUnmount()
	{
		this._mounted = false;
	}

	handleDownloadLog()
	{
		// BOM + charset: иначе Safari показывает кириллицу кракозябрами
		const text = `\ufeff${callLogger.asText()}`;
		const blob = new Blob([ text ], { type: 'text/plain;charset=utf-8' });
		const name = `sip-log-${new Date().toISOString()
			.replace(/[:.]/g, '-')}.txt`;

		if (navigator.clipboard && navigator.clipboard.writeText)
			navigator.clipboard.writeText(callLogger.asText()).catch(() => {});

		const link = document.createElement('a');

		link.href = URL.createObjectURL(blob);
		link.download = name;
		link.rel = 'noopener';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		setTimeout(() => URL.revokeObjectURL(link.href), 10000);

		this.props.onShowSnackbar(
			`Журнал: ${callLogger.entries.length} записей. Скопирован и сохранён файлом.`,
			4000);
	}

	handleMenuCopyInvitationLink()
	{
		logger.debug('handleMenuCopyInvitationLink()');

		const message = 'Invitation link copied to the clipboard';

		this.props.onShowSnackbar(message, 3000);
	}

	handleMenuCopyUri()
	{
		logger.debug('handleMenuCopyUri()');

		const message = 'Your SIP URI copied to the clipboard';

		this.props.onShowSnackbar(message, 3000);
	}

	handleMenuExit()
	{
		logger.debug('handleMenuExit()');

		this._ua.stop();
		this.props.onExit();
	}

	handleOutgoingCall(uri)
	{
		logger.debug('handleOutgoingCall() [uri:"%s"]', uri);

		const media = this.state.media;
		const pcConfig = this.props.settings.pcConfig || { iceServers: [] };

		// Транспорт уже закрыт (сеть пропала / АТС разорвала WebSocket).
		// JsSIP в этом случае молча завершит звонок причиной "Canceled" через
		// пару миллисекунд: INVITE собрался, а отправить его некуда. В журнале
		// это выглядит как «звонок не уходит» без причины — поэтому отказываем
		// явно и просим дождаться переподключения.
		if (this._ua && !this._ua.isConnected())
		{
			// logSession, а не log: звонок ещё не начат, у log() нет контекста
			// и запись бы молча пропала
			callLogger.logSession('call_blocked', null,
				{ reason: 'no_transport', regStatus: this.state.status });

			this.props.onNotify(
				{
					level   : 'error',
					title   : 'Нет связи с сервером',
					message : 'WebSocket закрыт — звонок не отправится. ' +
						'Дождитесь переподключения (статус «connected») и позвоните снова.'
				});

			return;
		}

		callLogger.start(
			{
				to         : uri,
				ws         : this.props.settings.socket.uri,
				iceServers : JSON.stringify(pcConfig.iceServers || []),
				audio      : media.audio,
				video      : media.video,
				regStatus  : this.state.status
			});

		const session = this._ua.call(uri,
			{
				pcConfig            : pcConfig,
				mediaConstraints    : this._mediaConstraints(),
				rtcOfferConstraints :
				{
					offerToReceiveAudio : 1,
					offerToReceiveVideo : media.video ? 1 : 0
				},
				eventHandlers :
				{
					sdp     : () => callLogger.log('sdp_ready'),
					sending : (data) =>
					{
						const method = data && data.request ? data.request.method : '?';

						if (method !== 'INVITE')
							return;

						callLogger.log('invite_sent');
						this._watchInviteTransaction(session);
					},
					progress : (data) =>
					{
						const code = data && data.response ? data.response.status_code : '?';

						callLogger.log('progress', { code });
					},
					accepted : () =>
					{
						callLogger.log('accepted');
						this._logMedia(session, 'outgoing');

						// Ждём установления медиа и проверяем микрофон
						this._whenConnected(session, () => this._startQualityMonitor(session));
					},
					failed : (data) =>
					{
						// Canceled сразу после отправки = транспорт закрыт,
						// INVITE некуда было отправить (см. onTransportDisconnect в JsSIP)
						const hint = (data.cause === 'Canceled' && this._ua &&
							!this._ua.isConnected()) ? 'transport_closed' : undefined;

						callLogger.log('failed', { cause: data.cause, hint });
					},
					ended : (data) => callLogger.log('ended',
						{ cause: data && data.cause ? data.cause : '?' })
				}
			});

		this._instrument(session);
		this._guardIce(session);
		this._watchMediaFailure(session);

		session.on('connecting', () =>
		{
			this.setState({ session });
		});

		session.on('progress', () =>
		{
			audioPlayer.play('ringback');
		});

		session.on('failed', (data) =>
		{
			audioPlayer.stop('ringback');
			audioPlayer.play('rejected');
			this.setState({ session: null });

			this.props.onNotify(
				{
					level   : 'error',
					title   : 'Call failed',
					message : data.cause
				});
		});

		session.on('ended', () =>
		{
			audioPlayer.stop('ringback');
			this.setState({ session: null });
		});

		session.on('accepted', () =>
		{
			audioPlayer.stop('ringback');
			audioPlayer.play('answered');
		});
	}

	// Аудио/видео из настроек вкладки
	_readMedia(settings)
	{
		const media = settings && settings.media ? settings.media : {};

		return {
			audio       : media.audio !== false,
			video       : media.video !== false,
			audioDevice : media.audioDevice || null,
			videoDevice : media.videoDevice || null
		};
	}

	_mediaConstraints()
	{
		const media = this.state.media;
		let audio = media.audio;
		let video = media.video;

		if (audio && media.audioDevice)
			audio = { deviceId: { exact: media.audioDevice } };

		if (video && media.videoDevice)
			video = { deviceId: { exact: media.videoDevice } };

		return { audio, video };
	}

	handleMediaChange(changed)
	{
		const media = Object.assign({}, this.state.media, changed);
		const settings = Object.assign({}, this.props.settings, { media });

		settingsManager.set(settings);
		this.setState({ media, settings });

		callLogger.log('media_toggle', { audio: media.audio, video: media.video });
	}

	// Метки соединения в журнал: ICE, дорожки, статистика
	_instrument(session)
	{
		const pc = session && session.connection;

		if (!pc)
			return;

		callLogger.log('pc_created');

		pc.addEventListener('icecandidate', (event) =>
		{
			const candidate = event.candidate;

			if (!candidate)
			{
				callLogger.log('ice_end');

				return;
			}

			const match = / typ (\w+)/.exec(candidate.candidate || '');

			callLogger.log('ice_candidate',
				{
					type  : match ? match[1] : '?',
					addr  : candidate.address || '?',
					proto : candidate.protocol || '?'
				});
		});

		pc.addEventListener('icegatheringstatechange', () =>
		{
			callLogger.log('ice_state', { state: pc.iceGatheringState });
		});

		pc.addEventListener('iceconnectionstatechange', () =>
		{
			callLogger.log('ice_conn', { state: pc.iceConnectionState });
		});

		callLogger.log('ice_state', { state: pc.iceGatheringState });
	}

	// Вызывает колбэк, когда медиа-соединение установилось
	_whenConnected(session, callback)
	{
		const pc = session && session.connection;

		if (!pc)
			return;

		let called = false;

		const check = () =>
		{
			if (called)
				return;

			const state = pc.connectionState || pc.iceConnectionState;

			if (state === 'connected' || state === 'completed' || state === 'checking')
			{
				called = true;
				pc.removeEventListener('connectionstatechange', check);
				pc.removeEventListener('iceconnectionstatechange', check);
				callback();
			}
		};

		pc.addEventListener('connectionstatechange', check);
		pc.addEventListener('iceconnectionstatechange', check);

		// Проверяем сразу — соединение могло установиться до подписки
		check();

		// Страховка: если состояния не пришли, стартуем через 1.5 с всё равно
		setTimeout(() => { called = false; check(); }, 1500);
		setTimeout(() =>
		{
			if (!called)
			{
				called = true;
				callback();
			}
		}, 2500);
	}

	// Периодический мониторинг качества звонка (каждые QUALITY_INTERVAL_MS):
	// уровень микрофона, пакеты в обе стороны, jitter, RTT, потери.
	// Проблемы пишем в консоль и в журнал; один раз показываем уведомление.
	_startQualityMonitor(session)
	{
		const pc = session && session.connection;

		if (!pc || session._qualityTimer)
			return;

		// Проблемы по каждому показателю
		const problems = new Map();
		// Счётчики для вычисления дельт
		let prevIn = null;
		let prevOut = null;
		let prevLost = null;
		// Последний измеренный уровень микрофона
		let lastMicLevel = null;

		// Проблема активна, пока метрика вне нормы; при возврате в норму
		// она снимается (clear)
		const raise = (key, text) =>
		{
			if (problems.has(key))
				return;

			problems.set(key, text);

			/* eslint-disable no-console */
			console.warn(`[quality] ${text}`);
			/* eslint-enable no-console */

			callLogger.log('quality_problem', { key, text, active: true });
		};

		const clear = (key) =>
		{
			if (!problems.has(key))
				return;

			const text = problems.get(key);

			problems.delete(key);

			/* eslint-disable no-console */
			console.info(`[quality] восстановлено: ${text}`);
			/* eslint-enable no-console */

			callLogger.log('quality_problem', { key, text, active: false });
		};

		const measureMic = (done) =>
		{
			const senders = pc.getSenders ? pc.getSenders() : [];
			const sender = senders.find((item) => item.track && item.track.kind === 'audio');

			if (!sender || !sender.track)
			{
				raise('no-mic', 'Нет сигнала с микрофона, проверьте устройства');
				lastMicLevel = 0;

				if (typeof done === 'function')
					done(0);

				return;
			}

			const Ctx = window.AudioContext || window.webkitAudioContext;

			if (!Ctx)
				return;

			let ctx;
			let analyser;

			try
			{
				ctx = new Ctx();
				ctx.resume().catch(() => {});

				const source = ctx.createMediaStreamSource(new MediaStream([ sender.track ]));

				analyser = ctx.createAnalyser();
				analyser.fftSize = 1024;
				source.connect(analyser);
			}
			catch (error)
			{
				return;
			}

			const data = new Uint8Array(analyser.fftSize);
			let peak = 0;
			let ticks = 0;

			const tick = () =>
			{
				analyser.getByteTimeDomainData(data);

				for (let i = 0; i < data.length; i += 1)
					peak = Math.max(peak, Math.abs(data[i] - 128));

				ticks += 1;
			};

			const interval = setInterval(tick, 100);

			setTimeout(() =>
			{
				clearInterval(interval);

				try
				{
					ctx.close();
				}
				catch (error) {}

				const level = Number((peak / 128).toFixed(4));

				if (ticks && level < MIC_SILENCE_THRESHOLD)
				{
					raise('mic-silent',
						`Низкий уровень микрофона (level=${level}), проверьте устройства`);
				}
				else
				{
					clear('mic-silent');
					clear('no-mic');
				}

				lastMicLevel = level;

				callLogger.log('quality_mic', { level, polls: ticks });

				if (typeof done === 'function')
					done(level);
			}, QUALITY_MIC_WINDOW_MS);
		};

		const sampleNetwork = () =>
		{
			if (!pc.getStats)
				return;

			pc.getStats(null).then((stats) =>
			{
				let outPkt = 0;
				let inPkt = 0;
				let inLost = 0;
				let jitter = 0;
				let rtt = null;

				stats.forEach((stat) =>
				{
					if (stat.type === 'outbound-rtp' && stat.kind === 'audio')
					{
						outPkt += stat.packetsSent || 0;
					}
					else if (stat.type === 'inbound-rtp' && stat.kind === 'audio')
					{
						inPkt += stat.packetsReceived || 0;
						inLost += stat.packetsLost || 0;
						jitter = Math.max(jitter, stat.jitter || 0);
					}
					else if (stat.type === 'candidate-pair' && stat.state === 'succeeded')
					{
						if (typeof stat.currentRoundTripTime === 'number')
							rtt = Math.max(rtt || 0, stat.currentRoundTripTime);
					}
				});

				const inDelta = prevIn === null ? null : inPkt - prevIn;
				const outDelta = prevOut === null ? null : outPkt - prevOut;
				const lostDelta = prevLost === null ? 0 : inLost - prevLost;

				prevIn = inPkt;
				prevOut = outPkt;
				prevLost = inLost;

				const info =
				{
					inPkt    : inDelta === null ? '-' : inDelta,
					outPkt   : outDelta === null ? '-' : outDelta,
					expected : QUALITY_EXPECTED_PKT,
					lost     : lostDelta,
					jitter   : Number(jitter.toFixed(4)),
					rttMs    : rtt === null ? '-' : Math.round(rtt * 1000),
					level    : lastMicLevel === null ? '-' : lastMicLevel
				};

				callLogger.log('quality', info);

				/* eslint-disable no-console */
				console.log(
					`[quality] in=${info.inPkt} out=${info.outPkt} lost=${info.lost} ` +
					`jitter=${info.jitter} rtt=${info.rttMs}мс`);
				/* eslint-enable no-console */

				// Пороговые проверки: проблема ставится и снимается сама
				const check = (key, bad, text) =>
				{
					if (bad)
						raise(key, text);
					else
						clear(key);
				};

				check('no-in',
					inDelta !== null && inDelta < QUALITY_MIN_PKT,
					'Нет входящего аудио, возможны проблемы в сети');

				check('no-out',
					outDelta !== null && outDelta < QUALITY_MIN_PKT,
					'Нет исходящего аудио, проверьте микрофон');

				check('lost',
					lostDelta > QUALITY_MAX_LOST,
					`Потери пакетов: ${lostDelta} за интервал`);

				check('jitter',
					jitter > QUALITY_MAX_JITTER,
					`Высокий jitter: ${info.jitter}`);

				check('rtt',
					rtt !== null && rtt * 1000 > QUALITY_MAX_RTT,
					`Высокий RTT: ${info.rttMs} мс`);
			})
				.catch(() => {});
		};

		// Замер: сначала уровень микрофона (окно ~3 с), затем сеть — так
		// в одном срезе есть и микрофон, и пакеты/потери/jitter/RTT.
		const sample = () =>
		{
			if (session.isEstablished && !session.isEstablished())
				return;

			measureMic(() => sampleNetwork());
		};

		session._qualityTimer = setInterval(sample, QUALITY_INTERVAL_MS);

		// Первый замер — сразу, чтобы данные появились к 3 секундам
		sample();
	}

	_stopQualityMonitor(session)
	{
		if (session && session._qualityTimer)
		{
			clearInterval(session._qualityTimer);
			session._qualityTimer = null;
		}
	}

	_logMedia(session, direction)
	{
		const pc = session && session.connection;

		if (!pc)
			return;

		const kindOf = (item) => { return item.track ? item.track.kind : 'none'; };

		try
		{
			callLogger.log('tracks',
				{
					direction  : direction,
					sending    : (pc.getSenders() || []).map(kindOf).join(',') || 'нет',
					receiving  : (pc.getReceivers() || []).map(kindOf).join(',') || 'нет',
					connection : pc.connectionState
				});
		}
		catch (error)
		{
			logger.warn('_logMedia() | %s', error.message);
		}

		// Статистика по audio-RTP снимается дважды: на 6 и 15 секундах
		const poll = (tag) =>
		{
			if (!pc.getStats)
				return;

			pc.getStats(null).then((report) =>
			{
				let outBytes = 0;
				let inBytes = 0;
				let outPackets = 0;
				let inPackets = 0;

				report.forEach((stat) =>
				{
					if (stat.type === 'outbound-rtp' && stat.kind === 'audio')
					{
						outBytes += stat.bytesSent || 0;
						outPackets += stat.packetsSent || 0;
					}
					else if (stat.type === 'inbound-rtp' && stat.kind === 'audio')
					{
						inBytes += stat.bytesReceived || 0;
						inPackets += stat.packetsReceived || 0;
					}
				});

				callLogger.log('media',
					{
						tag,
						out  : `${outBytes}B/${outPackets}pkt`,
						in   : `${inBytes}B/${inPackets}pkt`,
						ice  : pc.iceConnectionState,
						conn : pc.connectionState
					});
			})
				.catch(() => {});
		};

		setTimeout(() => poll('6s'), 6000);
		setTimeout(() => poll('15s'), 15000);
	}

	// Официальный способ JsSIP завершить сбор ICE раньше таймаута:
	// event.ready() из события 'icecandidate' САМОЙ СЕССИИ (не нативного pc).
	// Тип: IceCandidateEvent { candidate, ready }.
	// Вызываем по первому srflx — публичный адрес уже есть, дальше ждать нечего.
	// Страж ICE: если за ICE_TIMEOUT_MS не собрано ни одного кандидата —
	// значит сеть или STUN/TURN недоступны, звонок завершаем с ошибкой.
	// Вынесено отдельным методом, чтобы можно было проверить без SIP.
	// Управление сбором ICE. Два независимых механизма:
	//   1) пришёл srflx            -> ready() (если галочка включена);
	//   2) общий таймаут сбора     -> ready() по истечении.
	// ВАЖНО: ни один из них НЕ прерывает звонок — только завершает ожидание
	// в JsSIP. Chrome продолжает собирать в фоне, звонок идёт дальше.
	_guardIce(session, hooks)
	{
		if (!session || session._iceGuarded)
			return;

		session._iceGuarded = true;

		const options = hooks || {};
		const iceSettings = Object.assign({}, DEFAULT_ICE_SETTINGS,
			(this.props.settings && this.props.settings.ice) || {});
		const notify = options.onNotify || ((data) => this.props.onNotify(data));
		const onReady = options.onReady || ((data) => data.ready());

		let candidates = 0;
		let srflxSeen = false;
		let finished = false;
		let timer = null;
		let lastData = null;

		// Снять таймер можно снаружи (например, при ошибке getusermedia,
		// когда сессия уже завершилась, а сбор формально ещё идёт)
		session._iceStop = () =>
		{
			finished = true;
			clearTimeout(timer);
		};

		// Завершаем ТОЛЬКО сбор: отпускаем JsSIP, звонок продолжается
		const release = (reason) =>
		{
			if (finished)
				return;

			finished = true;
			clearTimeout(timer);

			// Без кандидата отпускать нечего — тогда JsSIP ждёт complete сам
			if (!lastData)
			{
				callLogger.log('ice_release_skipped', { reason, candidates });

				return;
			}

			callLogger.log('ice_ready',
				{
					reason,
					candidates,
					srflx : srflxSeen,
					addr  : (lastData.candidate && lastData.candidate.address) || '-'
				});

			try
			{
				onReady(lastData);
			}
			catch (error)
			{
				logger.warn('_guardIce() ready | %s', error.message);
			}
		};

		// 2) Общий таймаут сбора: по истечении просто завершаем сбор
		if (iceSettings.gatherTimeout > 0)
		{
			timer = setTimeout(() =>
			{
				if (finished)
					return;

				if (!srflxSeen)
				{
					notify(
						{
							level   : 'info',
							title   : 'Нет публичного адреса',
							message : `За ${ iceSettings.gatherTimeout 
							} мс не получен srflx — звонок из другой сети может не установиться`
						});
				}

				release('timeout');
			}, iceSettings.gatherTimeout);
		}

		session.on('icecandidate', (data) =>
		{
			if (!data || finished)
				return;

			// Сбор завершился сам — таймер больше не нужен
			if (!data.candidate)
			{
				finished = true;
				clearTimeout(timer);

				callLogger.log('ice_gathering_done', { candidates, srflx: srflxSeen });

				return;
			}

			candidates += 1;
			lastData = data;

			if (srflxSeen || data.candidate.type !== 'srflx')
				return;

			srflxSeen = true;

			// 1) Галочка: завершать сбор по srflx
			if (iceSettings.releaseOnSrflx === false)
			{
				callLogger.log('ice_keep_gathering', { addr: data.candidate.address });

				return;
			}

			release('srflx');
		});
	}

	// Страховка: если звонок завершился (в т.ч. из-за отсутствия микрофона),
	// гасим таймер сбора ICE — иначе он сработает на мёртвой сессии.
	_watchMediaFailure(session)
	{
		if (!session || session._mediaFailWatched)
			return;

		session._mediaFailWatched = true;

		const stop = (cause) =>
		{
			if (session._iceStop)
				session._iceStop();

			this._stopQualityMonitor(session);
			clearTimeout(session._ackWaitTimer);

			callLogger.log('session_stop', { cause });
		};

		session.on('getusermediafailed', (error) =>
		{
			stop(`${error && error.name ? error.name : 'getusermediafailed'}`);
		});

		session.on('failed', (data) => stop(data && data.cause ? data.cause : 'failed'));
		session.on('ended', (data) => stop(data && data.cause ? data.cause : 'ended'));
	}

	// Следим за INVITE-транзакцией: если ответа нет, JsSIP истечёт по Timer B
	// (32 с). Без этих меток «Timer B expired» выглядит как зависание ICE.
	_watchInviteTransaction(session)
	{
		if (!session || session._inviteWatched)
			return;

		session._inviteWatched = true;

		const t0 = Date.now();

		callLogger.log('invite_tx', { started: 0 });

		const onResponse = () =>
		{
			callLogger.log('invite_tx_response', { ms: Date.now() - t0 });
		};

		session.on('progress', onResponse);

		// Timer B = 32 с, Timer M = 5 с после таймаута
		setTimeout(() =>
		{
			callLogger.log('invite_tx_32s', { note: 'если ответа не было — Timer B' });
		}, 32000);

		setTimeout(() =>
		{
			callLogger.log('invite_tx_37s', { note: 'Timer M' });
		}, 37000);
	}

	handleAnswerIncoming()
	{
		logger.debug('handleAnswerIncoming()');

		const session = this.state.incomingSession;

		session.answer(
			{
				pcConfig         : this.props.settings.pcConfig || { iceServers: [] },
				mediaConstraints : this._mediaConstraints()
			});
	}

	handleRejectIncoming()
	{
		logger.debug('handleRejectIncoming()');

		const session = this.state.incomingSession;

		session.terminate();
	}
}

Phone.propTypes =
{
	settings           : PropTypes.object.isRequired,
	onNotify           : PropTypes.func.isRequired,
	onHideNotification : PropTypes.func.isRequired,
	onShowSnackbar     : PropTypes.func.isRequired,
	onHideSnackbar     : PropTypes.func.isRequired,
	onExit             : PropTypes.func.isRequired
};
