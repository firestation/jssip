import React from 'react';
import PropTypes from 'prop-types';
import { List, ListItem } from 'material-ui/List';
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import clone from 'clone';
import classnames from 'classnames';
import Logger from '../Logger';
import TransitionAppear from './TransitionAppear';

const logger = new Logger('Settings');

// STUN timeout used by the "Test ICE" button
const ICE_TEST_TIMEOUT = 8000;

export default class Settings extends React.Component
{
	constructor(props)
	{
		super(props);

		const settings = props.settings;

		this.state =
		{
			settings : clone(settings, false),
			iceTest  :
			{
				status  : null,
				message : null
			},
			mediaTest :
			{
				message : null,
				active  : false
			},
			devices :
			{
				loaded : false,
				audio  : [],
				video  : []
			}
		};

		// Pending ICE test
		this._iceTest = null;
		// Preview stream
		this._previewStream = null;
		// Mounted flag
		this._mounted = false;
	}

	componentDidMount()
	{
		this._mounted = true;

		this._loadDevices();
	}

	componentWillUnmount()
	{
		this._mounted = false;

		this._stopIceTest();
		this._stopPreview();
	}

	render()
	{
		const settings = this.state.settings;

		return (
			<TransitionAppear duration={250}>
				<div data-component='Settings'>
					<h1>JsSIP UA settings</h1>

					<div className='item'>
						<TextField
							floatingLabelText='SIP URI'
							value={settings.uri || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeSipUri.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='SIP password'
							value={settings.password || ''}
							floatingLabelFixed
							fullWidth
							type='password'
							onChange={this.handleChangePassword.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='WebSocket URI'
							value={settings.socket.uri || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeWebSocketUri.bind(this)}
						/>
					</div>

					<div className='item'>
						<SelectField
							floatingLabelText='Via transport'
							value={settings.socket.via_transport || 'auto'}
							fullWidth
							onChange={this.handleChangeViaTransport.bind(this)}
						>
							<MenuItem value='auto' primaryText='auto'/>
							<MenuItem value='tcp' primaryText='TCP'/>
							<MenuItem value='tls' primaryText='TLS'/>
							<MenuItem value='ws' primaryText='WS'/>
							<MenuItem value='wss' primaryText='WSS'/>
						</SelectField>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='Registrar server'
							value={settings.registrar_server || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeRegistrarServer.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='Contact URI'
							value={settings.contact_uri || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeContactUri.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='Authorization user'
							value={settings.authorization_user || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeAuthorizationUser.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='Instance ID'
							value={settings.instance_id || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeInstanceId.bind(this)}
						/>
					</div>

					<div className='separator'/>

					<List>
						<ListItem
							primaryText='Session Timers'
							secondaryText='Enable Session Timers as per RFC 4028'
							secondaryTextLines={1}
							rightToggle={
								<Toggle
									defaultToggled={settings.session_timers}
									onToggle={this.handleToogleSessionTimers.bind(this)}
								/>
							}
						/>

						<ListItem
							primaryText='Preloaded Route'
							secondaryText='Add a Route header with the server URI'
							secondaryTextLines={1}
							rightToggle={
								<Toggle
									defaultToggled={settings.use_preloaded_route}
									onToggle={this.handleToogleUsePreloadedRoute.bind(this)}
								/>
							}
						/>
					</List>

					<div className='separator'/>

					<h1>ICE / STUN settings</h1>

					<div className='item'>
						<SelectField
							floatingLabelText='ICE transport policy'
							value={settings.pcConfig.iceTransportPolicy || 'all'}
							fullWidth
							onChange={this.handleChangeIceTransportPolicy.bind(this)}
						>
							<MenuItem value='all' primaryText='all (host + srflx + relay)'/>
							<MenuItem value='relay' primaryText='relay (TURN only)'/>
						</SelectField>
					</div>

					<div className='item'>
						<SelectField
							floatingLabelText='RTCP mux policy'
							value={settings.pcConfig.rtcpMuxPolicy || 'negotiate'}
							fullWidth
							onChange={this.handleChangeRtcpMuxPolicy.bind(this)}
						>
							<MenuItem value='negotiate' primaryText='negotiate'/>
							<MenuItem value='require' primaryText='require'/>
						</SelectField>
					</div>

					<List>
						<ListItem
							primaryText='Завершать сбор ICE по srflx'
							secondaryText='Не ждать полную сборку: как только получен публичный адрес'
							secondaryTextLines={2}
							rightToggle={
								<Toggle
									defaultToggled={settings.ice.releaseOnSrflx}
									onToggle={this.handleToogleReleaseOnSrflx.bind(this)}
								/>
							}
						/>
					</List>

					<div className='item'>
						<TextField
							floatingLabelText='Таймаут сбора ICE, мс'
							value={settings.ice.gatherTimeout}
							floatingLabelFixed
							fullWidth
							type='number'
							onChange={this.handleChangeGatherTimeout.bind(this)}
						/>
						<div className='help'>
							Общий таймаут на сбор ICE: по истечении сбор
							завершается (звонок продолжается), 500–60000 мс.
						</div>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='ICE servers (one URL per line, comma separated too)'
							value={this._iceServersToText()}
							floatingLabelFixed
							fullWidth
							multiLine
							rows={3}
							hintText='stun:stun.l.google.com:19302'
							onChange={this.handleChangeIceServers.bind(this)}
						/>
						<div className='help'>
							stun:stun.l.google.com:19302 — one entry per line.
							For TURN fill username and credential below;
							turn:user:pass@host:3478 also works without them.
						</div>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='ICE username (TURN)'
							value={settings.pcConfig.iceUsername || ''}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeIceUsername.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='ICE credential / password (TURN)'
							value={settings.pcConfig.iceCredential || ''}
							floatingLabelFixed
							fullWidth
							type='password'
							onChange={this.handleChangeIceCredential.bind(this)}
						/>
					</div>

					<div className='item'>
						<div className='buttons-row'>
							<RaisedButton
								label='Test ICE'
								onClick={this.handleClickTestIce.bind(this)}
							/>
							<span className={classnames('ice-result', this.state.iceTest.status)}>
								{this.state.iceTest.message}
							</span>
						</div>
					</div>

					<div className='separator'/>

					<h1>Media settings</h1>

					<List>
						<ListItem
							primaryText='Audio'
							secondaryText='Send microphone audio in calls'
							secondaryTextLines={1}
							rightToggle={
								<Toggle
									defaultToggled={settings.media.audio}
									onToggle={this.handleToogleAudio.bind(this)}
								/>
							}
						/>

						<ListItem
							primaryText='Video'
							secondaryText='Send and request video in calls'
							secondaryTextLines={1}
							rightToggle={
								<Toggle
									defaultToggled={settings.media.video}
									onToggle={this.handleToogleVideo.bind(this)}
								/>
							}
						/>
					</List>

					<If condition={this.state.devices.loaded}>
						<div className='item'>
							<SelectField
								floatingLabelText='Microphone'
								value={this._deviceValue('audio')}
								fullWidth
								onChange={this.handleChangeAudioDevice.bind(this)}
							>
								<MenuItem value='__default__' primaryText='System default'/>
								{this._renderDeviceItems('audio')}
							</SelectField>
						</div>

						<div className='item'>
							<SelectField
								floatingLabelText='Camera'
								value={this._deviceValue('video')}
								fullWidth
								onChange={this.handleChangeVideoDevice.bind(this)}
							>
								<MenuItem value='__default__' primaryText='System default'/>
								{this._renderDeviceItems('video')}
							</SelectField>
						</div>
					</If>

					<div className='item'>
						<div className='buttons-row'>
							<RaisedButton
								label='Local media preview'
								onClick={this.handleClickTestMedia.bind(this)}
							/>
							<span className='ice-result'>
								{this.state.mediaTest.message}
							</span>
						</div>

						<If condition={this.state.mediaTest.active}>
							<video
								ref='previewVideo'
								className='local-preview'
								autoPlay
								muted
							/>
						</If>
					</div>

					<div className='separator'/>

					<h1>callstats.io settings</h1>

					<List>
						<ListItem
							primaryText='Enabled'
							secondaryText='Send call statistics to callstats.io'
							secondaryTextLines={1}
							rightToggle={
								<Toggle
									defaultToggled={settings.callstats.enabled}
									onToggle={this.handleToogleCallstatsEnabled.bind(this)}
								/>
							}
						/>
					</List>

					<div className='separator'/>

					<div className='item'>
						<TextField
							floatingLabelText='AppID'
							value={settings.callstats.AppID || ''}
							disabled={!settings.callstats.enabled}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeCallstatsAppID.bind(this)}
						/>
					</div>

					<div className='item'>
						<TextField
							floatingLabelText='AppSecret'
							value={settings.callstats.AppSecret || ''}
							disabled={!settings.callstats.enabled}
							floatingLabelFixed
							fullWidth
							onChange={this.handleChangeCallstatsAppSecret.bind(this)}
						/>
					</div>

					<div className='separator'/>

					<div className='buttons'>
						<RaisedButton
							label='Cancel'
							secondary
							style={{ display: 'block' }}
							onClick={this.handleCancel.bind(this)}
						/>

						<RaisedButton
							label='OK'
							primary
							style={{ display: 'block' }}
							onClick={this.handleSubmit.bind(this)}
						/>
					</div>
				</div>
			</TransitionAppear>
		);
	}

	handleChangeSipUri(event)
	{
		const settings = this.state.settings;

		settings.uri = event.target.value;
		this.setState({ settings });
	}

	handleChangePassword(event)
	{
		const settings = this.state.settings;

		settings.password = event.target.value;
		this.setState({ settings });
	}

	handleChangeWebSocketUri(event)
	{
		const settings = this.state.settings;

		settings.socket.uri = event.target.value;
		this.setState({ settings });
	}

	handleChangeViaTransport(event, key, value)
	{
		const settings = this.state.settings;

		settings.socket['via_transport'] = value;
		this.setState({ settings });
	}

	handleChangeRegistrarServer(event)
	{
		const settings = this.state.settings;

		settings['registrar_server'] = event.target.value;
		this.setState({ settings });
	}

	handleChangeContactUri(event)
	{
		const settings = this.state.settings;

		settings['contact_uri'] = event.target.value;
		this.setState({ settings });
	}

	handleChangeAuthorizationUser(event)
	{
		const settings = this.state.settings;

		settings['authorization_user'] = event.target.value;
		this.setState({ settings });
	}

	handleChangeInstanceId(event)
	{
		const settings = this.state.settings;

		settings['instance_id'] = event.target.value;
		this.setState({ settings });
	}

	handleToogleSessionTimers()
	{
		const settings = this.state.settings;

		settings['session_timers'] = !settings.session_timers;
		this.setState({ settings });
	}

	handleToogleUsePreloadedRoute()
	{
		const settings = this.state.settings;

		settings['use_preloaded_route'] = !settings.use_preloaded_route;
		this.setState({ settings });
	}

	handleToogleReleaseOnSrflx()
	{
		const settings = this.state.settings;

		settings.ice.releaseOnSrflx = !settings.ice.releaseOnSrflx;
		this.setState({ settings });
	}

	handleChangeGatherTimeout(event)
	{
		const settings = this.state.settings;
		const value = Number(event.target.value);

		settings.ice.gatherTimeout = Number.isFinite(value) ? value : 0;
		this.setState({ settings });
	}

	handleChangeIceTransportPolicy(event, key, value)
	{
		const settings = this.state.settings;

		settings.pcConfig['iceTransportPolicy'] = value;
		this.setState({ settings });
	}

	handleChangeRtcpMuxPolicy(event, key, value)
	{
		const settings = this.state.settings;

		settings.pcConfig['rtcpMuxPolicy'] = value;
		this.setState({ settings });
	}

	handleChangeIceServers(event)
	{
		const settings = this.state.settings;

		// Keep the raw text so a half-typed line is not destroyed while typing
		settings.pcConfig.iceServersText = event.target.value;
		settings.pcConfig.iceServers = this._parseIceServers(event.target.value);
		this.setState({ settings });
	}

	handleChangeIceUsername(event)
	{
		const settings = this.state.settings;

		settings.pcConfig.iceUsername = event.target.value;
		this.setState({ settings });
	}

	handleChangeIceCredential(event)
	{
		const settings = this.state.settings;

		settings.pcConfig.iceCredential = event.target.value;
		this.setState({ settings });
	}

	handleToogleAudio()
	{
		const settings = this.state.settings;

		settings.media.audio = !settings.media.audio;
		this.setState({ settings });

		// Preview follows the toggle
		if (!settings.media.audio)
			this._stopPreview();
	}

	handleToogleVideo()
	{
		const settings = this.state.settings;

		settings.media.video = !settings.media.video;
		this.setState({ settings });

		if (!settings.media.video)
			this._stopPreview();
	}

	handleChangeAudioDevice(event, key, value)
	{
		const settings = this.state.settings;

		settings.media.audioDevice = value && value !== '__default__' ? value : null;
		this.setState({ settings });
	}

	handleChangeVideoDevice(event, key, value)
	{
		const settings = this.state.settings;

		settings.media.videoDevice = value && value !== '__default__' ? value : null;
		this.setState({ settings });
	}

	handleClickTestIce()
	{
		logger.debug('handleClickTestIce()');

		this._stopIceTest();

		const pcConfig = this._buildPcConfig(this.state.settings.pcConfig);
		const servers = pcConfig.iceServers;

		logger.debug('handleClickTestIce() [pcConfig:%o]', pcConfig);

		if (!servers.length)
		{
			this.setState(
				{
					iceTest :
					{
						status  : 'error',
						message : 'No ICE servers configured'
					}
				});

			return;
		}

		const stunServers = servers.filter((server) =>
			this._getIceServerUrls(server).some((url) => this._isStunUrl(url)));

		if (!stunServers.length)
		{
			this.setState(
				{
					iceTest :
					{
						status  : 'error',
						message : 'No STUN server to test against (TURN is not tested here)'
					}
				});

			return;
		}

		this.setState(
			{
				iceTest :
				{
					status  : 'pending',
					message : 'Gathering candidates ...'
				}
			});

		const found = {};
		let pc;

		// Human readable summary of what ICE gathering actually produced
		const describe = (prefix) =>
		{
			const parts = [];

			if (found.srflx)
				parts.push(`public address ${found.srflx}`);

			if (found.relay)
				parts.push(`TURN relay ${found.relay}`);

			if (!parts.length)
			{
				parts.push(found.host ?
					`only host candidate ${found.host}, STUN/TURN did not answer` :
					'no candidates at all');
			}

			return `${prefix}: ${parts.join(', ')}`;
		};

		const finish = (status, message) =>
		{
			if (!this._iceTest)
				return;

			this._closeIceTest();

			if (!this._mounted)
				return;

			this.setState(
				{
					iceTest :
					{
						status,
						message
					}
				});
		};

		const check = () =>
		{
			if (!found.srflx && !found.relay)
				return;

			finish('success', describe('ICE OK'));
		};

		try
		{
			pc = new RTCPeerConnection(pcConfig);
		}
		catch (error)
		{
			finish('error', `RTCPeerConnection error: ${error.message}`);

			return;
		}

		// When no STUN/TURN answer arrives in time, report what we did get
		const fail = () => finish('error', describe('ICE test failed'));

		this._iceTest =
		{
			pc,
			timer : setTimeout(() =>
			{
				if (this._iceTest)
					fail();
			}, ICE_TEST_TIMEOUT)
		};

		// Empty data channel is enough to start ICE gathering
		pc.createDataChannel('ice-test');

		pc.onicecandidate = (event) =>
		{
			const candidate = event.candidate;

			if (!candidate || !candidate.candidate)
				return;

			// "candidate:foundation component transport priority address port typ type"
			const match = / typ (host|srflx|prflx|relay)/.exec(candidate.candidate);
			const type = match ? match[1] : 'unknown';
			const fields = candidate.candidate.split(' ');
			const address = fields[4];
			const port = fields[5];

			logger.debug('handleClickTestIce() [candidate:%s]', candidate.candidate);

			// Address and port come from the candidate line itself, those fields
			// are the only ones guaranteed by the spec
			const where = `${address || '?'}:${port || '?'}`;

			if (type === 'host' && !found.host)
				found.host = where;

			if (type === 'srflx' && !found.srflx)
				found.srflx = where;

			if (type === 'relay' && !found.relay)
				found.relay = where;

			check();
		};

		pc.onicegatheringstatechange = () =>
		{
			if (pc.iceGatheringState === 'complete')
				fail();
		};

		pc.createOffer()
			.then((offer) => pc.setLocalDescription(offer))
			.catch((error) => finish('error', `ICE test error: ${error.message}`));
	}

	handleClickTestMedia()
	{
		logger.debug('handleClickTestMedia()');

		const settings = this.state.settings;

		if (this._previewStream)
		{
			this._stopPreview();
			this.setState({ mediaTest: { message: null, active: false } });

			return;
		}

		const constraints = {};

		if (settings.media.audio)
			constraints.audio = settings.media.audioDevice ?
				{ deviceId: { exact: settings.media.audioDevice } } : true;

		if (settings.media.video)
			constraints.video = settings.media.videoDevice ?
				{ deviceId: { exact: settings.media.videoDevice } } : true;

		if (!constraints.audio && !constraints.video)
		{
			this.setState(
				{
					mediaTest :
					{
						message : 'Audio and video are both disabled',
						active  : false
					}
				});

			return;
		}

		navigator.mediaDevices.getUserMedia(constraints)
			.then((stream) =>
			{
				if (!this._mounted)
				{
					stream.getTracks().forEach((track) => track.stop());

					return;
				}

				this._previewStream = stream;

				if (this.refs.previewVideo)
					this.refs.previewVideo.srcObject = stream;

				// Device labels are only available once permission is granted
				this._loadDevices();

				const parts = [];

				if (constraints.audio)
					parts.push('audio');

				if (constraints.video)
					parts.push('video');

				this.setState(
					{
						mediaTest :
						{
							message : `OK: ${parts.join(' + ')}`,
							active  : true
						}
					});
			})
			.catch((error) =>
			{
				if (!this._mounted)
					return;

				logger.debug('handleClickTestMedia() | error: %s', error.message);

				this.setState(
					{
						mediaTest :
						{
							message : `Error: ${error.name}: ${error.message}`,
							active  : false
						}
					});
			});
	}

	handleToogleCallstatsEnabled()
	{
		const settings = this.state.settings;

		settings['callstats']['enabled'] = !settings.callstats.enabled;
		this.setState({ settings });
	}

	handleChangeCallstatsAppID(event)
	{
		const settings = this.state.settings;

		settings.callstats.AppID = event.target.value;
		this.setState({ settings });
	}

	handleChangeCallstatsAppSecret(event)
	{
		const settings = this.state.settings;

		settings.callstats.AppSecret = event.target.value;
		this.setState({ settings });
	}

	handleSubmit()
	{
		logger.debug('handleSubmit()');

		this._stopPreview();

		const settings = this.state.settings;

		this.props.onSubmit(settings);
	}

	handleCancel()
	{
		logger.debug('handleCancel()');

		this._stopPreview();
		this._stopIceTest();
		this.props.onCancel();
	}

	// ICE servers as text: one URL per line
	_iceServersToText()
	{
		const pcConfig = this.state.settings.pcConfig || {};

		// Text typed by the user wins over the parsed array
		if (typeof pcConfig.iceServersText === 'string')
			return pcConfig.iceServersText;

		const iceServers = pcConfig.iceServers || [];
		const lines = [];

		for (const server of iceServers)
		{
			for (const url of this._getIceServerUrls(server))
			{
				// Keep credentials in the dedicated fields, not in the URL
				lines.push(url.replace(/^([a-z]+:)[^@/]*@/i, '$1'));
			}
		}

		return lines.join('\n');
	}

	_parseIceServers(text)
	{
		const settings = this.state.settings;
		const username = settings.pcConfig.iceUsername || null;
		const credential = settings.pcConfig.iceCredential || null;
		const seen = {};

		return String(text || '')
			.split(/[\n,]+/)
			.map((item) => item.trim())
			.filter((item) =>
			{
				if (!item || seen[item])
					return false;

				seen[item] = true;

				return true;
			})
			.map((item) =>
			{
				const server = { urls: [ item ] };

				if (/^turns?:/i.test(item) && username && credential)
				{
					server.username = username;
					server.credential = credential;
				}

				return server;
			});
	}

	// Same filtering as in Phone, so the test matches the real call
	_buildPcConfig(pcConfig)
	{
		const config = clone(pcConfig || {});
		const iceServers = Array.isArray(config.iceServers) ? config.iceServers : [];

		config.iceServers = iceServers.filter((server) =>
			this._getIceServerUrls(server).length > 0);

		// Credentials are shared between all TURN servers
		if (config.iceUsername && config.iceCredential)
		{
			config.iceServers.forEach((server) =>
			{
				const urls = this._getIceServerUrls(server);

				if (urls.some((url) => /^turns?:/i.test(url)))
				{
					server.username = config.iceUsername;
					server.credential = config.iceCredential;
				}
			});
		}

		if (!config.iceTransportPolicy)
			config.iceTransportPolicy = 'all';

		if (config.iceTransportPolicy === 'relay' && !config.iceServers.length)
			config.iceTransportPolicy = 'all';

		return config;
	}

	_getIceServerUrls(server)
	{
		if (!server || !server.urls)
			return [];

		const urls = Array.isArray(server.urls) ? server.urls : [ server.urls ];

		return urls
			.filter((url) => typeof url === 'string')
			.map((url) => url.trim())
			.filter((url) => url !== '');
	}

	_isStunUrl(url)
	{
		return /^stuns?:/i.test(url);
	}

	_deviceValue(kind)
	{
		const media = this.state.settings.media;
		const devices = this.state.devices[kind];
		const value = kind === 'audio' ? media.audioDevice : media.videoDevice;

		// Keep the saved device selectable even if it is not plugged in now
		if (value && !devices.some((device) => device.deviceId === value))
			return '__saved__';

		return value || '__default__';
	}

	_renderDeviceItems(kind)
	{
		const media = this.state.settings.media;
		const value = kind === 'audio' ? media.audioDevice : media.videoDevice;
		const items = this.state.devices[kind].map((device) =>
		{
			return (
				<MenuItem
					key={device.deviceId}
					value={device.deviceId}
					primaryText={device.label}
				/>
			);
		});

		// Saved but currently missing device stays visible under its own name
		if (value && this._deviceValue(kind) === '__saved__')
		{
			items.push(
				<MenuItem
					key='__saved__'
					value='__saved__'
					primaryText={`${value} (not available)`}
				/>);
		}

		return items;
	}

	_loadDevices()
	{
		if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices)
			return;

		navigator.mediaDevices.enumerateDevices()
			.then((devices) =>
			{
				if (!this._mounted)
					return;

				const audio = [];
				const video = [];
				let index = 0;

				for (const device of devices)
				{
					if (device.kind === 'audioinput')
					{
						index += 1;
						audio.push({
							deviceId : device.deviceId,
							label    : device.label || `Microphone ${index}`
						});
					}
					else if (device.kind === 'videoinput')
					{
						index += 1;
						video.push({
							deviceId : device.deviceId,
							label    : device.label || `Camera ${index}`
						});
					}
				}

				this.setState({ devices: { loaded: true, audio, video } });
			})
			.catch((error) =>
			{
				logger.debug('_loadDevices() | error: %s', error.message);
			});
	}

	_stopPreview()
	{
		if (this._previewStream)
		{
			this._previewStream.getTracks().forEach((track) => track.stop());
			this._previewStream = null;
		}

		if (this.refs.previewVideo)
			this.refs.previewVideo.srcObject = null;

		if (this._mounted && this.state.mediaTest.active)
			this.setState({ mediaTest: { message: null, active: false } });
	}

	_closeIceTest()
	{
		if (!this._iceTest)
			return;

		clearTimeout(this._iceTest.timer);

		try
		{
			this._iceTest.pc.close();
		}
		catch (error) {}

		this._iceTest = null;
	}

	_stopIceTest()
	{
		this._closeIceTest();
	}
}

Settings.propTypes =
{
	settings : PropTypes.object.isRequired,
	onSubmit : PropTypes.func.isRequired,
	onCancel : PropTypes.func.isRequired
};
