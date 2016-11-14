import { Component } from "@angular/core";
import { NavController } from 'ionic-angular';
import { SQLite} from 'ionic-native';
import { Http, Response, Headers } from '@angular/http';
import { URLSearchParams, Jsonp } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import { Geolocation } from 'ionic-native';
import { Storage } from '@ionic/storage';

// [Step 1 - Using SQLite]
// import { SQLite } from 'ionic-native';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';

@Component({
  selector: 'home-page',
  templateUrl: 'home.html'
})
export class HomePage {

  public data: any;
  public errorMessage: any;
  public storage: SQLite;
  public ionicStorage: Storage;
  private mapsApiUrl: string = "https://maps.googleapis.com/maps/api/geocode/json";
  private mapsApiKey: string = "AIzaSyC_BzkNOG-dUL7jsCPXnrS5D-cFTaEcrZE";
  private weatherApiUrl: string = "https://api.forecast.io/forecast/";
  private weatherApiKey: string = "44e49e44a5eb1237bffcfb78aa33ffbb";

  constructor(private _navController: NavController, private jsonp: Jsonp, private http: Http) {

    this.data = {};
    // [Step 2 - Creating Tables]
    this.storage = new SQLite();
    this.storage.openDatabase({
      name: 'ionic.offline',
      location: 'default'
    }).then(() => {
      this.storage.executeSql(`create table if not exists forecasts(
        date CHAR(5) PRIMARY KEY,
        location CHAR(40),
        icon CHAR(30),
        tempCurrent INT,
        tempMin INT,
        tempMax INT
      ))`, {});
    });

    // [Step 5 - Tying it Together] // Main Function which is checking whether to Get data from db or Server
    this.getForecast(this.getToday()).then((data) => {
      if (data) {
        // obtained forecast from database
        this.data = data;
      } else {
        // could not get forecast from database, go to network
        this.fetchForecasts();
      }
    });

  }

  handleError(error: any) {
    console.log('error', error);
    let errMsg = (error.message) ? error.message :
      error.status ? `${error.status} - ${error.statusText}` : 'Server error';
    console.error(errMsg);
    return Observable.throw(errMsg);
  }

  // NETWORK

  fetchForecasts() {

    this.fetchCoordinates()
      .then((coords) => {
        this.data.coords = coords;
        // return this.fetchCityStateName(coords.latitude, coords.longitude);
      })
      .then((locationName) => {
        this.data.location = locationName;
        this.fetchWeatherData(this.data.coords.latitude, this.data.coords.longitude)
          .subscribe(
          data => this.data = data[0],
          error => this.errorMessage = error);
      });
  }

  fetchWeatherData(lat, long) {
    let url = `${this.weatherApiUrl}${this.weatherApiKey}/${lat},${long}?callback=JSONP_CALLBACK`;
    return this.jsonp.get(url)
      .map(this.formatWeatherData)
      // .map(this.saveForecasts)
      .catch(this.handleError);
  }

  fetchCoordinates() {
    return Geolocation.getCurrentPosition().then((data) => {
      this.ionicStorage.set('latitude', data.coords.latitude);
      this.ionicStorage.set('longitude', data.coords.longitude);
      return data.coords;
    }, (err) => {
      console.log('positionError', err);
    });
  }

  fetchCityStateName(lat, long) {
    let url = `${this.mapsApiUrl}?latlng=${lat},${long}&key=${this.mapsApiKey}`;
    let city: string;
    let state: string;
    this.http.get(url)
      .map(res => {
        return res.json();
      })
      .subscribe(
      data => {
        data.results[0].address_components.map((item) => {
          if (item.types[0] === "locality") {
            city = item.long_name;
          }
          if (item.types[0] === "administrative_area_level_1") {
            state = item.short_name;
          }
        });
        let location = `${city}, ${state}`;
        this.data.location = location;
        this.saveLocation(location);
      }
      );
  }

  // DATABASE

  saveLocation(location: string) {
    this.ionicStorage.set('location', location);
  }

  getLocation() {
    return this.ionicStorage.get('location').then((location) => {
      return location;
    });
  }

  // [Step 4 - Retrieving Data]
  getForecast(date: string) {
    return this.storage.executeSql("SELECT * FROM forecasts WHERE date = ?", { date }).then((resp) => {
      if (resp.res.rows.length > 0) {
        for (var i = 0; i < resp.res.rows.length; i++) {
          let item = resp.res.rows.item(i);
          return item;
        }
      }
    });
  }


  // [Step 3 - Saving Data]
  saveForecasts = (forecasts) => {
    let query = "INSERT OR REPLACE INTO forecasts VALUES (?, ?, ?, ?, ?, ?)";
    for (let forecast of forecasts) {
      this.storage.executeSql(query, [
        forecast.date,
        forecast.location,
        forecast.icon,
        forecast.tempCurrent,
        forecast.tempMin,
        forecast.tempMax
      ]);
    }
    return forecasts;
  }


  // UTILITY

  formatWeatherData = (res: Response) => {
    let body = res.json();

    // format today's weather data
    let icon = this.getIoniconName(body.currently.icon);
    let date = this.dateFromTimestamp(body.currently.time);
    let formattedData = [
      {
        'date': date,
        'location': this.data.location,
        'icon': icon,
        'tempCurrent': Math.round(body.currently.temperature),
        'tempMin': Math.round(body.daily.data[0].temperatureMin),
        'tempMax': Math.round(body.daily.data[0].temperatureMax)
      }
    ];

    // format this week's weather data
    for (let item of body.daily.data.slice(1)) {
      let icon = this.getIoniconName(item.icon);
      let date = this.dateFromTimestamp(item.time);
      formattedData.push({
        'date': date,
        'location': this.data.location,
        'icon': icon,
        'tempCurrent': Math.round((item.temperatureMin + item.temperatureMax) / 2),
        'tempMin': Math.round(item.temperatureMin),
        'tempMax': Math.round(item.temperatureMax)
      });
    }
    return formattedData || [];
  }

  getIoniconName(forecastIconName) {
    return {
      'clear-day': 'sunny',
      'clear-night': 'moon',
      'rain': 'rainy',
      'snow': 'snow',
      'sleet': 'snow',
      'wind': 'cloudy',
      'fog': 'cloud',
      'cloudy': 'cloud',
      'partly-cloudy-day': 'partly-sunny',
      'partly-cloudy-night': 'cloudy-night'
    }[forecastIconName];
  }

  // DATES

  getToday() {
    let timestamp = (Date.now() / 1000);
    return this.dateFromTimestamp(timestamp);
  }

  dateFromTimestamp(timestamp: number) {
    let date = new Date(timestamp * 1000);
    return date.getMonth().toString() + '/' + date.getDate().toString();
  }

}
