import React, { Component } from 'react'
import './App.css'
import Mqtt from 'mqtt'
import R from 'ramda'
import moment from 'moment'

const MQTT_BROKER = 'ws://mqtt-home.chacal.online:8883'

class App extends Component {
  constructor(props) {
    super(props)
    this.state = { sensorValues: {} }
    this.startMqttClient()
  }

  render() {
    return (
      <div className="container">
        <div className="row">
          <h1>Sensors</h1>
          <h2>Temperature</h2>
          {renderTemperatures(this.state.sensorValues)}
          <h2>Humidity</h2>
          {renderHumidities(this.state.sensorValues)}
          <h2>Pressure</h2>
          {renderPressures(this.state.sensorValues)}
          <h2>Tank level</h2>
          {renderTankLevels(this.state.sensorValues)}
        </div>
      </div>
    )
  }

  startMqttClient() {
    const mqttClient = Mqtt.connect(MQTT_BROKER)
    mqttClient.on('connect', () => {
      mqttClient.subscribe('/sensor/+/+/state')
      mqttClient.on('message', (topic, message) => {
        try {
          const event = JSON.parse(message)
          const hierarchicalEvent = { [event.instance + '_' + event.tag]: event }

          this.setState(prevState => ({ sensorValues: R.mergeWith(R.merge, prevState.sensorValues, hierarchicalEvent) }))
        } catch (e) {
          console.warn('Exception when handling MQTT message:', message.toString(), e)
        }
      })
    })
  }
}

function renderTemperatures(sensorValues) { return renderBasicEvents(sensorValues, 't', R.prop('temperature'), '°C') }
function renderHumidities(sensorValues) { return renderBasicEvents(sensorValues, 'h', R.prop('humidity'), '%H') }
function renderPressures(sensorValues) { return renderBasicEvents(sensorValues, 'p', R.prop('pressure'), 'mbar') }
function renderTankLevels(sensorValues) { return renderBasicEvents(sensorValues, 'w', R.prop('tankLevel'), '%') }

function renderBasicEvents(sensorValues, tag, valueExtractor, unitLabel) {
  return <table className="table table-striped table-bordered text-right basic-event">
    <tbody>{
      eventsByTag(sensorValues, tag).map(e =>
        <tr key={e.instance}>
          <td>{e.instance}</td>
          <td>{valueExtractor(e).toFixed(2) + ' ' + unitLabel}</td>
          <td>{e.vcc ? (e.vcc / 1000).toFixed(3) + 'V' : '-'}</td>
          <td>{e.previousSampleTimeMicros ? e.previousSampleTimeMicros + 'µs' : '-'}</td>
          <td>{moment(e.ts).format('HH:mm:ss')}</td>
        </tr>)
    }</tbody>
  </table>

}

function eventsByTag(sensorValues, tag) {
  return R.pipe(
    R.values,
    R.filter(R.propEq('tag', tag)),
    R.sortBy(R.prop('instance'))
  )(sensorValues)
}

export default App

